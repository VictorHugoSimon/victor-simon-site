import { bearerToken, id, json, normalizeText, parseJson, verifyToken } from './lib.mjs';

const CHANNELS = new Set(['blog', 'linkedin', 'instagram', 'newsletter', 'website']);

function clean(value, max = 500) { return normalizeText(value, max); }
function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, Number(value || 0))); }
function asJson(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }
function round(value, digits = 1) { const p = 10 ** digits; return Math.round(Number(value || 0) * p) / p; }

async function isAdmin(request, env) {
  return Boolean(await verifyToken(bearerToken(request), env.AUTH_SECRET));
}
async function requireAdmin(request, env) {
  return (await isAdmin(request, env)) ? null : json({ error: 'unauthorized' }, { status: 401 });
}
function isRobot(request, env) {
  const key = request.headers.get('X-Robot-Key') || bearerToken(request);
  return Boolean(env.ROBOT_KEY && key === env.ROBOT_KEY);
}

function extractText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  if (typeof result?.result?.response === 'string') return result.result.response;
  return JSON.stringify(result || {});
}
function extractJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const a = cleaned.indexOf('{'); const b = cleaned.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)); } catch {} }
  }
  return null;
}

function metricScores(m = {}) {
  const impressions = Math.max(0, Number(m.impressions || 0));
  const reach = Math.max(0, Number(m.reach || 0));
  const engagements = Math.max(0, Number(m.engagements || 0));
  const clicks = Math.max(0, Number(m.clicks || 0));
  const leads = Math.max(0, Number(m.leads || 0));
  const meetings = Math.max(0, Number(m.meetings || 0));
  const proposals = Math.max(0, Number(m.proposals || 0));
  const wins = Math.max(0, Number(m.wins || 0));
  const seoClicks = Math.max(0, Number(m.seoClicks || m.seo_clicks || 0));
  const seoImpressions = Math.max(0, Number(m.seoImpressions || m.seo_impressions || 0));
  const avgPosition = Number(m.avgPosition ?? m.avg_position ?? 100);

  const reachScore = clamp(Math.log10(Math.max(1, impressions + reach) + 1) * 22);
  const engagementRate = impressions ? (engagements / impressions) * 100 : 0;
  const engagementScore = clamp(engagementRate * 12);
  const clickRate = impressions ? (clicks / impressions) * 100 : 0;
  const trafficScore = clamp(clickRate * 18);
  const leadScore = clamp(leads * 22 + meetings * 15);
  const seoCtr = seoImpressions ? (seoClicks / seoImpressions) * 100 : 0;
  const seoPositionScore = avgPosition > 0 ? clamp(105 - avgPosition * 5) : 0;
  const seoScore = clamp(seoCtr * 12 + seoPositionScore * 0.55);
  const conversionScore = clamp(wins * 60 + proposals * 22 + meetings * 10);
  const contentScore = round(
    reachScore * 0.15 + engagementScore * 0.2 + trafficScore * 0.15 + leadScore * 0.2 + seoScore * 0.1 + conversionScore * 0.2
  );
  return { contentScore, engagementRate: round(engagementRate, 2), clickRate: round(clickRate, 2), seoCtr: round(seoCtr, 2) };
}

async function recordAgent(env, agentKey, triggerType, inputRef, fn, metadata = {}) {
  const runId = id('agent');
  const started = Date.now();
  await env.DB.prepare(`INSERT INTO agent_runs (id, agent_key, trigger_type, input_ref, status, started_at, metadata_json)
    VALUES (?, ?, ?, ?, 'running', CURRENT_TIMESTAMP, ?)`)
    .bind(runId, agentKey, triggerType, clean(inputRef, 500), JSON.stringify(metadata)).run();
  try {
    const output = await fn(runId);
    await env.DB.prepare(`UPDATE agent_runs SET status='completed', output_ref=?, duration_ms=?, completed_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(clean(output?.outputRef || '', 500), Date.now() - started, runId).run();
    return { runId, ...output };
  } catch (error) {
    await env.DB.prepare(`UPDATE agent_runs SET status='failed', error_message=?, duration_ms=?, completed_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(clean(error?.message || 'unknown_error', 1000), Date.now() - started, runId).run();
    throw error;
  }
}

function safeExternalUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return null;
    return url;
  } catch { return null; }
}

async function fetchSource(urlValue) {
  const url = safeExternalUrl(urlValue);
  if (!url) throw new Error('invalid_source_url');
  const response = await fetch(url.toString(), { headers: { 'User-Agent': 'VictorHugoGrowthOS/1.0' }, redirect: 'follow' });
  if (!response.ok) throw new Error(`source_http_${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/') && !type.includes('json') && !type.includes('xml')) throw new Error('unsupported_source_type');
  const raw = (await response.text()).slice(0, 120_000);
  const text = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { url: url.toString(), text: text.slice(0, 30_000) };
}

async function ingestMetrics(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 40_000);
  const contentItemId = clean(body.contentItemId, 100);
  const channel = CHANNELS.has(body.channel) ? body.channel : '';
  if (!contentItemId || !channel) return json({ error: 'validation_error' }, { status: 422 });
  const current = await env.DB.prepare('SELECT id FROM content_items WHERE id=?').bind(contentItemId).first();
  if (!current) return json({ error: 'content_not_found' }, { status: 404 });
  const m = body.metrics || {};
  const scores = metricScores(m);
  const metricDate = /^\d{4}-\d{2}-\d{2}$/.test(body.metricDate || '') ? body.metricDate : new Date().toISOString().slice(0, 10);
  const rowId = id('perf');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO content_performance_daily (
      id, content_item_id, publication_id, channel, metric_date, impressions, reach, engagements, clicks, leads,
      meetings, proposals, wins, revenue, seo_clicks, seo_impressions, avg_position, content_score, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(content_item_id, channel, metric_date) DO UPDATE SET
      publication_id=excluded.publication_id, impressions=excluded.impressions, reach=excluded.reach,
      engagements=excluded.engagements, clicks=excluded.clicks, leads=excluded.leads, meetings=excluded.meetings,
      proposals=excluded.proposals, wins=excluded.wins, revenue=excluded.revenue, seo_clicks=excluded.seo_clicks,
      seo_impressions=excluded.seo_impressions, avg_position=excluded.avg_position, content_score=excluded.content_score,
      metadata_json=excluded.metadata_json, updated_at=CURRENT_TIMESTAMP`)
      .bind(rowId, contentItemId, clean(body.publicationId, 100) || null, channel, metricDate,
        Number(m.impressions || 0), Number(m.reach || 0), Number(m.engagements || 0), Number(m.clicks || 0), Number(m.leads || 0),
        Number(m.meetings || 0), Number(m.proposals || 0), Number(m.wins || 0), Number(m.revenue || 0),
        Number(m.seoClicks || m.seo_clicks || 0), Number(m.seoImpressions || m.seo_impressions || 0),
        Number(m.avgPosition ?? m.avg_position ?? 0) || null, scores.contentScore, JSON.stringify(body.metadata || {})),
    env.DB.prepare('UPDATE content_items SET content_score=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(scores.contentScore, contentItemId)
  ]);
  return json({ contentItemId, channel, metricDate, ...scores });
}

async function trackTouch(request, env) {
  const body = await parseJson(request, 16_000);
  const sessionId = clean(body.sessionId, 120);
  if (!sessionId) return json({ error: 'session_required' }, { status: 422 });
  const touchId = id('touch');
  const source = clean(body.source || 'direct', 100);
  await env.DB.prepare(`INSERT INTO attribution_touches (
    id, session_id, content_item_id, publication_id, campaign_id, source, medium, campaign, term, content,
    landing_page, referrer, event_name, metadata_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(touchId, sessionId, clean(body.contentItemId, 100) || null, clean(body.publicationId, 100) || null,
      clean(body.campaignId, 100) || null, source, clean(body.medium, 100), clean(body.campaign, 180), clean(body.term, 180),
      clean(body.content, 180), clean(body.landingPage, 400), clean(body.referrer, 600), clean(body.eventName || 'touch', 80),
      JSON.stringify(body.metadata || {})).run();
  return json({ accepted: true, id: touchId }, { status: 202 });
}

async function attachLeadAttribution(env, leadId, sessionId) {
  if (!leadId || !sessionId) return;
  const touches = await env.DB.prepare(`SELECT * FROM attribution_touches WHERE session_id=? ORDER BY occurred_at ASC, id ASC`).bind(sessionId).all();
  if (!touches.results.length) return;
  const first = touches.results[0]; const last = touches.results[touches.results.length - 1];
  await env.DB.batch([
    env.DB.prepare('UPDATE attribution_touches SET lead_id=? WHERE session_id=? AND lead_id IS NULL').bind(leadId, sessionId),
    env.DB.prepare(`INSERT INTO lead_attribution (
      lead_id, first_touch_id, last_touch_id, first_source, last_source, first_content_item_id, last_content_item_id,
      first_campaign_id, last_campaign_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(lead_id) DO UPDATE SET last_touch_id=excluded.last_touch_id, last_source=excluded.last_source,
      last_content_item_id=excluded.last_content_item_id, last_campaign_id=excluded.last_campaign_id, updated_at=CURRENT_TIMESTAMP`)
      .bind(leadId, first.id, last.id, first.source, last.source, first.content_item_id, last.content_item_id, first.campaign_id, last.campaign_id)
  ]);
}

async function performanceSummary(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const [totals, top, channels, attribution] = await env.DB.batch([
    env.DB.prepare(`SELECT COALESCE(SUM(impressions),0) impressions, COALESCE(SUM(reach),0) reach,
      COALESCE(SUM(engagements),0) engagements, COALESCE(SUM(clicks),0) clicks, COALESCE(SUM(leads),0) leads,
      COALESCE(SUM(meetings),0) meetings, COALESCE(SUM(proposals),0) proposals, COALESCE(SUM(wins),0) wins,
      COALESCE(SUM(revenue),0) revenue, COALESCE(AVG(content_score),0) avg_content_score
      FROM content_performance_daily WHERE metric_date >= date('now','-30 day')`),
    env.DB.prepare(`SELECT c.id, c.title, c.channel, c.pillar, c.content_score,
      COALESCE(SUM(p.impressions),0) impressions, COALESCE(SUM(p.clicks),0) clicks, COALESCE(SUM(p.leads),0) leads
      FROM content_items c LEFT JOIN content_performance_daily p ON p.content_item_id=c.id AND p.metric_date >= date('now','-30 day')
      GROUP BY c.id ORDER BY c.content_score DESC, impressions DESC LIMIT 10`),
    env.DB.prepare(`SELECT channel, COUNT(DISTINCT content_item_id) content_count, COALESCE(SUM(impressions),0) impressions,
      COALESCE(SUM(clicks),0) clicks, COALESCE(SUM(leads),0) leads, COALESCE(AVG(content_score),0) score
      FROM content_performance_daily WHERE metric_date >= date('now','-30 day') GROUP BY channel ORDER BY impressions DESC`),
    env.DB.prepare(`SELECT COALESCE(first_source,'unknown') source, COUNT(*) leads FROM lead_attribution GROUP BY first_source ORDER BY leads DESC LIMIT 12`)
  ]);
  return json({ totals: totals.results[0] || {}, top: top.results, channels: channels.results, attribution: attribution.results });
}

async function researchIdea(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 30_000);
  const ideaId = clean(body.ideaId, 100);
  const sourceUrl = clean(body.sourceUrl, 1000);
  const idea = ideaId ? await env.DB.prepare('SELECT * FROM content_ideas WHERE id=?').bind(ideaId).first() : null;
  if (!idea || !sourceUrl) return json({ error: 'idea_and_source_required' }, { status: 422 });
  const result = await recordAgent(env, 'researcher', 'manual', ideaId, async () => {
    const source = await fetchSource(sourceUrl);
    let note = { summary: source.text.slice(0, 1400), facts: [], confidence: 0.55, sourceTitle: '' };
    if (env.AI?.run) {
      const prompt = `Você é o Pesquisador do Growth OS de Victor Hugo. Analise a fonte abaixo sem inventar fatos. Tema da pauta: ${idea.title}.\nFonte: ${source.url}\nTexto: ${source.text}\nRetorne SOMENTE JSON com sourceTitle, publisher, summary (até 1200 caracteres), facts (array de até 8 fatos objetivos) e confidence (0 a 1).`;
      const ai = extractJson(extractText(await env.AI.run('@cf/zai-org/glm-4.7-flash', { prompt, max_tokens: 1500 })));
      if (ai?.summary) note = { ...note, ...ai };
    }
    const noteId = id('research');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO research_notes (id, idea_id, source_url, source_title, publisher, summary, facts_json, confidence, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'review')`)
        .bind(noteId, ideaId, source.url, clean(note.sourceTitle, 300), clean(note.publisher, 200), clean(note.summary, 4000),
          JSON.stringify(Array.isArray(note.facts) ? note.facts.slice(0, 8) : []), clamp(note.confidence, 0, 1)),
      env.DB.prepare("UPDATE content_ideas SET status='researching', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(ideaId)
    ]);
    return { outputRef: noteId, noteId };
  });
  return json(result, { status: 201 });
}

async function listResearch(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const url = new URL(request.url); const ideaId = clean(url.searchParams.get('ideaId'), 100);
  const stmt = ideaId
    ? env.DB.prepare('SELECT * FROM research_notes WHERE idea_id=? ORDER BY researched_at DESC LIMIT 50').bind(ideaId)
    : env.DB.prepare('SELECT * FROM research_notes ORDER BY researched_at DESC LIMIT 100');
  const result = await stmt.all();
  return json({ notes: result.results.map((r) => ({ ...r, facts: asJson(r.facts_json, []) })) });
}

async function runStrategist(env, triggerType = 'manual') {
  return recordAgent(env, 'strategist', triggerType, 'content_ideas', async () => {
    const [ideas, perf] = await env.DB.batch([
      env.DB.prepare("SELECT * FROM content_ideas WHERE status IN ('backlog','selected','researching') ORDER BY created_at DESC LIMIT 80"),
      env.DB.prepare(`SELECT c.pillar, COALESCE(AVG(p.content_score),0) score, COUNT(p.id) samples
        FROM content_items c LEFT JOIN content_performance_daily p ON p.content_item_id=c.id AND p.metric_date >= date('now','-60 day')
        GROUP BY c.pillar`)
    ]);
    const pillarPerf = new Map(perf.results.map((r) => [r.pillar || '', Number(r.score || 0)]));
    const updates = [];
    for (const idea of ideas.results) {
      const meta = asJson(idea.metadata_json);
      const evidence = Number(meta.researchCount || 0) + (idea.status === 'researching' ? 1 : 0);
      const recency = Math.max(0, 20 - Math.floor((Date.now() - new Date(idea.created_at).getTime()) / 86400000));
      const historical = pillarPerf.get(idea.pillar) || 35;
      const score = Math.round(clamp(35 + historical * 0.35 + evidence * 8 + recency * 0.6));
      updates.push(env.DB.prepare(`UPDATE content_ideas SET score=?, metadata_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(score, JSON.stringify({ ...meta, strategist: { score, historicalPillarScore: round(historical), evidence, evaluatedAt: new Date().toISOString() } }), idea.id));
    }
    if (updates.length) await env.DB.batch(updates);
    return { outputRef: `ideas:${updates.length}`, evaluated: updates.length };
  });
}

async function runRadar(env, triggerType = 'manual', sources = []) {
  return recordAgent(env, 'radar', triggerType, 'radar_sources', async () => {
    const candidates = [];
    for (const item of Array.isArray(sources) ? sources.slice(0, 12) : []) {
      if (!item?.title) continue;
      candidates.push({ title: clean(item.title, 180), url: clean(item.url, 1000), summary: clean(item.summary, 1200) });
    }
    if (!candidates.length) {
      const gaps = await env.DB.prepare(`SELECT pillar, COUNT(*) total FROM content_items WHERE created_at >= datetime('now','-60 day') GROUP BY pillar`).all();
      const byPillar = new Map(gaps.results.map((r) => [r.pillar || '', Number(r.total || 0)]));
      const pillars = ['PMO & Governança','Produto & Delivery','IA & Automação','Transformação Digital','Dados & Mercado','AgTech'];
      for (const pillar of pillars) candidates.push({ title: `Atualizar autoridade em ${pillar}`, url: '', summary: `Pilar com ${byPillar.get(pillar) || 0} conteúdos nos últimos 60 dias; gerar pauta prática e atualizável.` });
    }
    let ideas = candidates.slice(0, 8).map((c) => ({ title: c.title, pillar: 'Transformação Digital', brief: c.summary, sourceUrl: c.url, score: 55 }));
    if (env.AI?.run) {
      const prompt = `Você é o Radar editorial de Victor Hugo. A partir destes sinais, gere até 8 pautas profissionais úteis e não sensacionalistas. Pilares permitidos: PMO & Governança, Produto & Delivery, IA & Automação, Transformação Digital, Dados & Mercado, AgTech. Retorne SOMENTE JSON {"ideas":[{"title":"","pillar":"","brief":"","score":0}]}. Sinais: ${JSON.stringify(candidates)}`;
      const ai = extractJson(extractText(await env.AI.run('@cf/zai-org/glm-4.7-flash', { prompt, max_tokens: 1800 })));
      if (Array.isArray(ai?.ideas)) ideas = ai.ideas.slice(0, 8);
    }
    const statements = [];
    const ids = [];
    for (const idea of ideas) {
      const title = clean(idea.title, 180); const pillar = clean(idea.pillar, 80);
      if (title.length < 8 || !pillar) continue;
      const exists = await env.DB.prepare('SELECT id FROM content_ideas WHERE lower(title)=lower(?) LIMIT 1').bind(title).first();
      if (exists) continue;
      const ideaId = id('idea'); ids.push(ideaId);
      statements.push(env.DB.prepare(`INSERT INTO content_ideas (id,title,pillar,source,source_url,brief,score,status,metadata_json)
        VALUES (?, ?, ?, 'radar', ?, ?, ?, 'backlog', ?)`)
        .bind(ideaId, title, pillar, clean(idea.sourceUrl || '', 1000), clean(idea.brief, 3000), clamp(idea.score || 55), JSON.stringify({ radar: true })));
    }
    if (statements.length) await env.DB.batch(statements);
    return { outputRef: `ideas:${ids.length}`, ideasCreated: ids.length, ids };
  });
}

async function runGrowthCoach(env, triggerType = 'manual') {
  return recordAgent(env, 'growth_coach', triggerType, 'performance:30d', async () => {
    const [perf, ideas, leads] = await env.DB.batch([
      env.DB.prepare(`SELECT channel, COALESCE(SUM(impressions),0) impressions, COALESCE(SUM(clicks),0) clicks,
        COALESCE(SUM(leads),0) leads, COALESCE(AVG(content_score),0) score FROM content_performance_daily
        WHERE metric_date >= date('now','-30 day') GROUP BY channel`),
      env.DB.prepare("SELECT pillar, COUNT(*) total FROM content_ideas WHERE status='backlog' GROUP BY pillar"),
      env.DB.prepare("SELECT stage, COUNT(*) total, COALESCE(SUM(estimated_value),0) value FROM leads GROUP BY stage")
    ]);
    const context = { performance: perf.results, backlog: ideas.results, leads: leads.results };
    let recommendations = [];
    if (env.AI?.run) {
      const prompt = `Você é o Growth Coach do perfil profissional de Victor Hugo. Analise estes dados sem inventar números. Gere até 6 recomendações acionáveis para conteúdo, distribuição, SEO ou conversão. Retorne SOMENTE JSON {"recommendations":[{"type":"content|distribution|seo|conversion","title":"","rationale":"","priority":"high|medium|low","action":{}}]}. Dados: ${JSON.stringify(context)}`;
      const ai = extractJson(extractText(await env.AI.run('@cf/zai-org/glm-4.7-flash', { prompt, max_tokens: 1800 })));
      if (Array.isArray(ai?.recommendations)) recommendations = ai.recommendations.slice(0, 6);
    }
    if (!recommendations.length) {
      const weak = [...perf.results].sort((a,b) => Number(a.score || 0) - Number(b.score || 0))[0];
      recommendations.push({ type: 'content', title: 'Priorizar conteúdo aprovado e mensurável', rationale: 'O ciclo precisa de publicações com métricas suficientes para calibrar o Content Score.', priority: 'high', action: { view: 'content' } });
      if (weak) recommendations.push({ type: 'distribution', title: `Revisar distribuição em ${weak.channel}`, rationale: `Score médio atual de ${round(weak.score)} no canal.`, priority: 'medium', action: { channel: weak.channel } });
    }
    await env.DB.prepare("UPDATE growth_recommendations SET status='superseded', resolved_at=CURRENT_TIMESTAMP WHERE status='open' AND recommendation_type IN ('content','distribution','seo','conversion')").run();
    const statements = recommendations.map((r) => env.DB.prepare(`INSERT INTO growth_recommendations (id,recommendation_type,title,rationale,priority,status,action_json)
      VALUES (?, ?, ?, ?, ?, 'open', ?)`)
      .bind(id('rec'), clean(r.type || 'content', 60), clean(r.title, 220), clean(r.rationale, 2000), ['high','medium','low'].includes(r.priority) ? r.priority : 'medium', JSON.stringify(r.action || {})));
    if (statements.length) await env.DB.batch(statements);
    return { outputRef: `recommendations:${statements.length}`, recommendations: statements.length };
  });
}

async function recomputeScores(env, triggerType = 'manual') {
  return recordAgent(env, 'analytics', triggerType, 'content_performance_daily', async () => {
    const rows = await env.DB.prepare(`SELECT content_item_id, channel,
      SUM(impressions) impressions, SUM(reach) reach, SUM(engagements) engagements, SUM(clicks) clicks, SUM(leads) leads,
      SUM(meetings) meetings, SUM(proposals) proposals, SUM(wins) wins, SUM(seo_clicks) seo_clicks,
      SUM(seo_impressions) seo_impressions, AVG(avg_position) avg_position
      FROM content_performance_daily WHERE metric_date >= date('now','-30 day') GROUP BY content_item_id, channel`).all();
    const best = new Map();
    for (const row of rows.results) {
      const score = metricScores(row).contentScore;
      best.set(row.content_item_id, Math.max(best.get(row.content_item_id) || 0, score));
    }
    const statements = [...best.entries()].map(([contentId, score]) => env.DB.prepare('UPDATE content_items SET content_score=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(score, contentId));
    if (statements.length) await env.DB.batch(statements);
    return { outputRef: `scores:${statements.length}`, updated: statements.length };
  });
}

async function cycleStatus(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare('SELECT * FROM growth_cycles ORDER BY created_at DESC LIMIT 30').all();
  return json({ cycles: result.results.map((r) => ({ ...r, summary: asJson(r.summary_json) })) });
}

async function runCycle(env, triggerType = 'manual', sources = []) {
  const cycleId = id('cycle');
  await env.DB.prepare(`INSERT INTO growth_cycles (id, cycle_type, trigger_type, status) VALUES (?, 'growth_loop', ?, 'running')`).bind(cycleId, triggerType).run();
  try {
    const radar = await runRadar(env, triggerType, sources);
    const strategist = await runStrategist(env, triggerType);
    const analytics = await recomputeScores(env, triggerType);
    const coach = await runGrowthCoach(env, triggerType);
    const summary = { radar, strategist, analytics, coach };
    await env.DB.prepare("UPDATE growth_cycles SET status='completed', summary_json=?, completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify(summary), cycleId).run();
    return { cycleId, status: 'completed', summary };
  } catch (error) {
    await env.DB.prepare("UPDATE growth_cycles SET status='failed', summary_json=?, completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify({ error: clean(error?.message, 1000) }), cycleId).run();
    throw error;
  }
}

export async function handleGrowthLoopRoute(request, env) {
  const url = new URL(request.url); const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/growth-loop')) return null;
  if (request.method === 'POST' && path === '/api/growth-loop/touch') return trackTouch(request, env);
  if (request.method === 'POST' && path === '/api/growth-loop/metrics') return ingestMetrics(request, env);
  if (request.method === 'GET' && path === '/api/growth-loop/summary') return performanceSummary(request, env);
  if (request.method === 'GET' && path === '/api/growth-loop/research') return listResearch(request, env);
  if (request.method === 'POST' && path === '/api/growth-loop/research') return researchIdea(request, env);
  if (request.method === 'GET' && path === '/api/growth-loop/cycles') return cycleStatus(request, env);
  if (request.method === 'POST' && path === '/api/growth-loop/radar') {
    const denied = await requireAdmin(request, env); if (denied) return denied;
    const body = await parseJson(request, 40_000); return json(await runRadar(env, 'manual', body.sources || []));
  }
  if (request.method === 'POST' && path === '/api/growth-loop/strategist') {
    const denied = await requireAdmin(request, env); if (denied) return denied; return json(await runStrategist(env));
  }
  if (request.method === 'POST' && path === '/api/growth-loop/analytics') {
    const denied = await requireAdmin(request, env); if (denied) return denied; return json(await recomputeScores(env));
  }
  if (request.method === 'POST' && path === '/api/growth-loop/coach') {
    const denied = await requireAdmin(request, env); if (denied) return denied; return json(await runGrowthCoach(env));
  }
  if (request.method === 'POST' && path === '/api/growth-loop/run') {
    const denied = await requireAdmin(request, env); if (denied) return denied;
    const body = await parseJson(request, 40_000); return json(await runCycle(env, 'manual', body.sources || []));
  }
  if (request.method === 'POST' && path === '/api/growth-loop/robot/run') {
    if (!isRobot(request, env)) return json({ error: 'unauthorized' }, { status: 401 });
    const body = await parseJson(request, 40_000); return json(await runCycle(env, 'robot', body.sources || []));
  }
  return json({ error: 'not_found' }, { status: 404 });
}

export async function runScheduledGrowthLoop(env) {
  return runCycle(env, 'cron', []);
}

export { attachLeadAttribution, metricScores };
