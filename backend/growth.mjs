import { bearerToken, id, json, normalizeText, parseJson, slugify, verifyToken } from './lib.mjs';

const CONTENT_STATUSES = new Set(['draft', 'researching', 'review', 'approved', 'scheduled', 'published', 'archived']);
const IDEA_STATUSES = new Set(['backlog', 'selected', 'researching', 'converted', 'archived']);
const CHANNELS = new Set(['blog', 'linkedin', 'instagram', 'newsletter', 'website']);
const CONTENT_TYPES = new Set(['article', 'post', 'carousel', 'reel_script', 'newsletter', 'landing']);

async function isAdmin(request, env) {
  return Boolean(await verifyToken(bearerToken(request), env.AUTH_SECRET));
}

async function requireAdmin(request, env) {
  return (await isAdmin(request, env)) ? null : json({ error: 'unauthorized' }, { status: 401 });
}

function clean(value, max = 500) {
  return normalizeText(value, max);
}

function asJson(value, fallback = {}) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function safeLimit(value, fallback = 100, max = 200) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, max)) : fallback;
}

async function summary(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const [ideas, content, publications, agents, recommendations, accounts] = await env.DB.batch([
    env.DB.prepare('SELECT status, COUNT(*) total FROM content_ideas GROUP BY status'),
    env.DB.prepare('SELECT status, channel, COUNT(*) total FROM content_items GROUP BY status, channel'),
    env.DB.prepare("SELECT channel, COUNT(*) total FROM publications WHERE status = 'published' GROUP BY channel"),
    env.DB.prepare("SELECT status, COUNT(*) total FROM agent_runs WHERE created_at >= datetime('now','-30 day') GROUP BY status"),
    env.DB.prepare("SELECT priority, COUNT(*) total FROM growth_recommendations WHERE status = 'open' GROUP BY priority"),
    env.DB.prepare('SELECT channel, account_name, status, last_sync_at FROM social_accounts ORDER BY channel')
  ]);
  return json({
    ideas: ideas.results,
    content: content.results,
    publications: publications.results,
    agents: agents.results,
    recommendations: recommendations.results,
    accounts: accounts.results
  });
}

async function listIdeas(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const url = new URL(request.url);
  const status = clean(url.searchParams.get('status'), 40);
  const limit = safeLimit(url.searchParams.get('limit'));
  const statement = status
    ? env.DB.prepare('SELECT * FROM content_ideas WHERE status = ? ORDER BY score DESC, created_at DESC LIMIT ?').bind(status, limit)
    : env.DB.prepare('SELECT * FROM content_ideas ORDER BY score DESC, created_at DESC LIMIT ?').bind(limit);
  const result = await statement.all();
  return json({ ideas: result.results.map((row) => ({ ...row, metadata: asJson(row.metadata_json) })) });
}

async function createIdea(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 30_000);
  const title = clean(body.title, 180);
  const pillar = clean(body.pillar, 80);
  if (title.length < 8 || !pillar) return json({ error: 'validation_error' }, { status: 422 });
  const score = Math.max(0, Math.min(100, Number(body.score || 0)));
  const status = IDEA_STATUSES.has(body.status) ? body.status : 'backlog';
  const ideaId = id('idea');
  await env.DB.prepare(`
    INSERT INTO content_ideas (id, title, pillar, source, source_url, brief, score, status, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(ideaId, title, pillar, clean(body.source || 'manual', 60), clean(body.sourceUrl, 600), clean(body.brief, 4000), score, status, JSON.stringify(body.metadata || {})).run();
  return json({ id: ideaId, status }, { status: 201 });
}

async function updateIdea(request, env, ideaId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 20_000);
  const current = await env.DB.prepare('SELECT * FROM content_ideas WHERE id = ?').bind(ideaId).first();
  if (!current) return json({ error: 'not_found' }, { status: 404 });
  const status = body.status && IDEA_STATUSES.has(body.status) ? body.status : current.status;
  const score = body.score === undefined ? current.score : Math.max(0, Math.min(100, Number(body.score || 0)));
  await env.DB.prepare(`
    UPDATE content_ideas SET title = ?, pillar = ?, brief = ?, score = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(clean(body.title || current.title, 180), clean(body.pillar || current.pillar, 80), clean(body.brief ?? current.brief, 4000), score, status, ideaId).run();
  return json({ id: ideaId, status, score });
}

async function listContent(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const url = new URL(request.url);
  const status = clean(url.searchParams.get('status'), 40);
  const channel = clean(url.searchParams.get('channel'), 40);
  const limit = safeLimit(url.searchParams.get('limit'));
  let sql = 'SELECT * FROM content_items';
  const filters = []; const values = [];
  if (status) { filters.push('status = ?'); values.push(status); }
  if (channel) { filters.push('channel = ?'); values.push(channel); }
  if (filters.length) sql += ` WHERE ${filters.join(' AND ')}`;
  sql += ' ORDER BY COALESCE(scheduled_at, published_at, created_at) DESC LIMIT ?';
  values.push(limit);
  const result = await env.DB.prepare(sql).bind(...values).all();
  return json({ content: result.results.map((row) => ({ ...row, metadata: asJson(row.metadata_json) })) });
}

async function createContent(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 200_000);
  const title = clean(body.title, 180);
  const channel = CHANNELS.has(body.channel) ? body.channel : 'blog';
  const contentType = CONTENT_TYPES.has(body.contentType) ? body.contentType : (channel === 'blog' ? 'article' : 'post');
  if (title.length < 8) return json({ error: 'validation_error' }, { status: 422 });
  const contentId = id('content');
  const status = CONTENT_STATUSES.has(body.status) ? body.status : 'draft';
  const slug = clean(body.slug, 180) || slugify(title);
  await env.DB.prepare(`
    INSERT INTO content_items (
      id, idea_id, parent_id, content_type, channel, language, title, body, hook, cta, pillar,
      status, scheduled_at, content_score, seo_title, seo_description, slug, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    contentId, clean(body.ideaId, 100) || null, clean(body.parentId, 100) || null,
    contentType, channel, body.language === 'en' ? 'en' : 'pt', title,
    String(body.body || '').trim().slice(0, 150_000), clean(body.hook, 600), clean(body.cta, 600), clean(body.pillar, 80),
    status, clean(body.scheduledAt, 60) || null, Math.max(0, Math.min(100, Number(body.contentScore || 0))),
    clean(body.seoTitle, 180), clean(body.seoDescription, 320), slug, JSON.stringify(body.metadata || {})
  ).run();
  return json({ id: contentId, status, slug }, { status: 201 });
}

async function updateContent(request, env, contentId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 200_000);
  const current = await env.DB.prepare('SELECT * FROM content_items WHERE id = ?').bind(contentId).first();
  if (!current) return json({ error: 'not_found' }, { status: 404 });
  const status = body.status && CONTENT_STATUSES.has(body.status) ? body.status : current.status;
  const scheduledAt = body.scheduledAt === undefined ? current.scheduled_at : (clean(body.scheduledAt, 60) || null);
  await env.DB.prepare(`
    UPDATE content_items SET title = ?, body = ?, hook = ?, cta = ?, pillar = ?, status = ?, scheduled_at = ?,
      seo_title = ?, seo_description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(
    clean(body.title || current.title, 180),
    body.body === undefined ? current.body : String(body.body || '').trim().slice(0, 150_000),
    body.hook === undefined ? current.hook : clean(body.hook, 600),
    body.cta === undefined ? current.cta : clean(body.cta, 600),
    body.pillar === undefined ? current.pillar : clean(body.pillar, 80),
    status, scheduledAt,
    body.seoTitle === undefined ? current.seo_title : clean(body.seoTitle, 180),
    body.seoDescription === undefined ? current.seo_description : clean(body.seoDescription, 320),
    contentId
  ).run();
  return json({ id: contentId, status, scheduledAt });
}

async function decideContent(request, env, contentId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 10_000);
  const decision = body.decision === 'approved' ? 'approved' : body.decision === 'rejected' ? 'rejected' : '';
  if (!decision) return json({ error: 'invalid_decision' }, { status: 422 });
  const current = await env.DB.prepare('SELECT id FROM content_items WHERE id = ?').bind(contentId).first();
  if (!current) return json({ error: 'not_found' }, { status: 404 });
  const approvalId = id('approval');
  const nextStatus = decision === 'approved' ? 'approved' : 'draft';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO approvals (id, content_item_id, decision, note, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(approvalId, contentId, decision, clean(body.note, 2000), 'admin'),
    env.DB.prepare('UPDATE content_items SET status = ?, approved_at = CASE WHEN ? = \'approved\' THEN CURRENT_TIMESTAMP ELSE approved_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(nextStatus, decision, contentId)
  ]);
  return json({ id: contentId, decision, status: nextStatus });
}

async function calendar(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const url = new URL(request.url);
  const days = Math.max(7, Math.min(180, Number(url.searchParams.get('days') || 45)));
  const result = await env.DB.prepare(`
    SELECT id, title, channel, content_type, status, scheduled_at, published_at, pillar
    FROM content_items
    WHERE scheduled_at IS NOT NULL AND scheduled_at >= datetime('now', '-1 day') AND scheduled_at <= datetime('now', '+' || ? || ' day')
    ORDER BY scheduled_at ASC
  `).bind(days).all();
  return json({ items: result.results });
}

async function recommendations(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare(`
    SELECT * FROM growth_recommendations WHERE status = 'open'
    ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT 100
  `).all();
  return json({ recommendations: result.results.map((row) => ({ ...row, action: asJson(row.action_json) })) });
}

async function agentRuns(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare(`
    SELECT id, agent_key, trigger_type, input_ref, output_ref, status, duration_ms, input_tokens, output_tokens,
      estimated_cost, error_message, started_at, completed_at, created_at
    FROM agent_runs ORDER BY created_at DESC LIMIT 100
  `).all();
  return json({ runs: result.results });
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
    const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) { try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {} }
  }
  return null;
}

async function generateDraft(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (!env.AI?.run) return json({ error: 'ai_binding_not_configured' }, { status: 503 });
  const body = await parseJson(request, 30_000);
  const topic = clean(body.topic, 500);
  const pillar = clean(body.pillar || 'Produto & Projetos', 100);
  const channel = CHANNELS.has(body.channel) ? body.channel : 'blog';
  const language = body.language === 'en' ? 'en' : 'pt';
  if (topic.length < 8) return json({ error: 'topic_required' }, { status: 422 });

  const runId = id('agent');
  const started = Date.now();
  await env.DB.prepare(`INSERT INTO agent_runs (id, agent_key, trigger_type, input_ref, status, started_at, metadata_json) VALUES (?, 'editorial_writer', 'manual', ?, 'running', CURRENT_TIMESTAMP, ?)`)
    .bind(runId, topic, JSON.stringify({ pillar, channel, language })).run();

  try {
    const prompt = `Você é o agente editorial do perfil profissional de Victor Hugo Teixeira Simon.\nObjetivo: produzir autoridade profissional sem exageros, sem inventar resultados, clientes, números ou depoimentos.\nPilar: ${pillar}\nCanal: ${channel}\nIdioma: ${language === 'en' ? 'English' : 'Português do Brasil'}\nTema: ${topic}\n\nRetorne SOMENTE JSON válido com: title, hook, body, cta, seoTitle, seoDescription, keywords (array de até 8 strings), derivedIdeas (array de 3 objetos com channel e angle).\nO texto deve ser prático, executivo, claro, baseado em experiência de gestão/produto/tecnologia, e não pode afirmar fatos não fornecidos no tema.`;
    const aiResult = await env.AI.run('@cf/zai-org/glm-4.7-flash', { prompt, max_tokens: 2500 });
    const raw = extractText(aiResult);
    const draft = extractJson(raw);
    if (!draft?.title || !draft?.body) throw new Error('AI_INVALID_JSON');

    const contentId = id('content');
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO content_items (id, content_type, channel, language, title, body, hook, cta, pillar, status, seo_title, seo_description, slug, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
      `).bind(
        contentId, channel === 'blog' ? 'article' : 'post', channel, language,
        clean(draft.title, 180), String(draft.body).slice(0, 150_000), clean(draft.hook, 600), clean(draft.cta, 600), pillar,
        clean(draft.seoTitle, 180), clean(draft.seoDescription, 320), slugify(draft.title),
        JSON.stringify({ aiGenerated: true, keywords: Array.isArray(draft.keywords) ? draft.keywords.slice(0, 8) : [], derivedIdeas: Array.isArray(draft.derivedIdeas) ? draft.derivedIdeas.slice(0, 6) : [] })
      ),
      env.DB.prepare(`UPDATE agent_runs SET output_ref = ?, status = 'completed', duration_ms = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(contentId, Date.now() - started, runId)
    ]);
    return json({ runId, contentId, status: 'draft', draft: { ...draft, body: String(draft.body) } }, { status: 201 });
  } catch (error) {
    await env.DB.prepare(`UPDATE agent_runs SET status = 'failed', duration_ms = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(Date.now() - started, clean(error?.message || 'AI_ERROR', 500), runId).run();
    return json({ error: 'generation_failed', runId }, { status: 502 });
  }
}

export async function handleGrowthRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/growth')) return null;

  if (request.method === 'GET' && path === '/api/growth/summary') return summary(request, env);
  if (request.method === 'GET' && path === '/api/growth/ideas') return listIdeas(request, env);
  if (request.method === 'POST' && path === '/api/growth/ideas') return createIdea(request, env);
  if (request.method === 'GET' && path === '/api/growth/content') return listContent(request, env);
  if (request.method === 'POST' && path === '/api/growth/content') return createContent(request, env);
  if (request.method === 'GET' && path === '/api/growth/calendar') return calendar(request, env);
  if (request.method === 'GET' && path === '/api/growth/recommendations') return recommendations(request, env);
  if (request.method === 'GET' && path === '/api/growth/agents/runs') return agentRuns(request, env);
  if (request.method === 'POST' && path === '/api/growth/generate') return generateDraft(request, env);

  const ideaMatch = path.match(/^\/api\/growth\/ideas\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'PATCH' && ideaMatch) return updateIdea(request, env, ideaMatch[1]);
  const contentMatch = path.match(/^\/api\/growth\/content\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'PATCH' && contentMatch) return updateContent(request, env, contentMatch[1]);
  const decisionMatch = path.match(/^\/api\/growth\/content\/([a-zA-Z0-9_-]+)\/decision$/);
  if (request.method === 'POST' && decisionMatch) return decideContent(request, env, decisionMatch[1]);
  return json({ error: 'not_found' }, { status: 404 });
}
