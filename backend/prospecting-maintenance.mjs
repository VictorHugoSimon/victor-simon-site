import { id, json, normalizeText } from './lib.mjs';

const GENERIC_ANCHORS = new Set(['saiba mais', 'leia mais', 'clique', 'cliques', 'acesse', 'site', 'website', 'home', 'image', 'imagem']);
const BLOCKED_HOST_PARTS = ['linkedin.com', 'facebook.com', 'instagram.com', 'youtube.com', 'youtu.be', 'sharepoint.com', 'freepik.com', 'adobe.com', 'google.com', 'x.com', 'twitter.com'];
const INTERNAL_HINTS = ['lider', 'leadership', 'govern', 'diretor', 'administra', 'gestao', 'management', 'equipe', 'team', 'quem-somos', 'sobre', 'about', 'institucional', 'contato', 'contact'];

function clean(value, max = 500) { return normalizeText(value, max); }
function clamp(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
}
function parseJson(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }
function norm(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function isRobot(request, env) {
  const key = request.headers.get('X-Robot-Key') || String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return Boolean(env.ROBOT_KEY && key === env.ROBOT_KEY);
}
function safePublicUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null;
    if (/^(?:127|10|0)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return null;
    if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) return null;
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) return null;
    return url;
  } catch { return null; }
}
function hostKey(value) {
  const url = safePublicUrl(value);
  return url ? url.hostname.toLowerCase().replace(/^www\./, '') : '';
}
function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8211;|&ndash;/gi, '-')
    .replace(/&#8212;|&mdash;/gi, '-')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
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
async function fetchPage(urlValue, timeoutMs = 8500) {
  let current = safePublicUrl(urlValue);
  if (!current) throw new Error('invalid_public_source');
  for (let hop = 0; hop < 4; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('source_timeout'), timeoutMs);
    let response;
    try {
      response = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'VictorHugoGrowthOS/1.2 (+public business research)' }
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error('source_timeout');
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`source_redirect_${response.status}`);
      const next = safePublicUrl(new URL(location, current).toString());
      if (!next) throw new Error('unsafe_redirect');
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`source_http_${response.status}`);
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    if (!type.includes('text/') && !type.includes('json') && !type.includes('xml')) throw new Error('unsupported_source_type');
    const raw = (await response.text()).slice(0, 160_000);
    const text = stripHtml(raw).slice(0, 45_000);
    if (text.length < 60) throw new Error('source_text_too_short');
    return { url: current.toString(), raw, text };
  }
  throw new Error('too_many_redirects');
}
function extractAnchors(raw, baseUrl) {
  const base = safePublicUrl(baseUrl);
  if (!base) return [];
  const rows = [];
  const regex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(String(raw || '')))) {
    let url;
    try { url = safePublicUrl(new URL(match[1], base).toString()); } catch { url = null; }
    if (!url) continue;
    const text = clean(stripHtml(match[2]), 180);
    rows.push({ url: url.toString(), text, host: hostKey(url.toString()) });
  }
  return rows;
}
function publicEmails(raw) {
  const matches = String(raw || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map((value) => value.toLowerCase()))]
    .filter((email) => !/(?:no-?reply|noreply|privacy|privacidade|dpo|lgpd|recrut|carreira|career|jobs?@)/i.test(email))
    .slice(0, 12);
}
function candidateName(anchorText, host) {
  const label = clean(anchorText, 120);
  const key = norm(label);
  if (label.length >= 3 && label.length <= 90 && !GENERIC_ANCHORS.has(key) && !/^https?\b/i.test(label)) return label;
  const root = String(host || '').split('.')[0] || '';
  return root ? root.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}
function isBlockedExternalHost(host) {
  return !host || BLOCKED_HOST_PARTS.some((part) => host === part || host.endsWith(`.${part}`));
}

async function runMarketScout(env, maxNew = 6) {
  const sources = await env.DB.prepare("SELECT * FROM crm_scout_sources WHERE status='active' ORDER BY COALESCE(last_scanned_at,'1970-01-01') ASC LIMIT 4").all();
  let discovered = 0;
  let created = 0;
  const findings = [];
  for (const source of sources.results) {
    try {
      const page = await fetchPage(source.url, 9000);
      const sourceHost = hostKey(page.url);
      const anchors = extractAnchors(page.raw, page.url);
      const unique = new Map();
      for (const anchor of anchors) {
        if (!anchor.host || anchor.host === sourceHost || isBlockedExternalHost(anchor.host)) continue;
        if (/\.(?:jpg|jpeg|png|gif|svg|webp|pdf|zip)$/i.test(new URL(anchor.url).pathname)) continue;
        const name = candidateName(anchor.text, anchor.host);
        if (name.length < 3) continue;
        if (!unique.has(anchor.host)) unique.set(anchor.host, { name, website: anchor.url, host: anchor.host });
      }
      for (const item of unique.values()) {
        discovered += 1;
        const candidateId = `scout_${source.id}_${item.host.replace(/[^a-z0-9]+/g, '_').slice(0, 70)}`;
        await env.DB.prepare(`INSERT INTO crm_scout_candidates (id,source_id,company_name,website,host_key,status,metadata_json)
          VALUES (?,?,?,?,?,'discovered',?)
          ON CONFLICT(source_id,host_key) DO UPDATE SET company_name=excluded.company_name,website=excluded.website,last_seen_at=CURRENT_TIMESTAMP`)
          .bind(candidateId, source.id, item.name, item.website, item.host, JSON.stringify({ sourceUrl: page.url, publicSource: true })).run();

        const existing = await env.DB.prepare("SELECT id FROM crm_accounts WHERE lower(replace(replace(website,'https://',''),'http://','')) LIKE ? LIMIT 1")
          .bind(`%${item.host}%`).first();
        if (existing) {
          await env.DB.prepare("UPDATE crm_scout_candidates SET status='existing',account_id=?,last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(existing.id, candidateId).run();
          continue;
        }
        if (created >= maxNew) continue;

        const accountId = id('account');
        const score = clamp(source.default_icp_score, 80);
        const offerKey = clean(source.default_offer_key || 'automacao-dados-ia', 100);
        const campaignId = parseJson(source.metadata_json, {}).campaignId || 'campaign_market_scout_continuous';
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO crm_accounts (id,name,website,industry,region,offer_key,icp_score,status,source,metadata_json)
            VALUES (?,?,?,'Agronegócio / indústria','Brasil',?,?,'researching',?,?)`)
            .bind(accountId, item.name, item.website, offerKey, score, `market_scout:${source.id}`, JSON.stringify({ scoutSourceId: source.id, discoveryUrl: page.url, researchPolicy: 'public_sources_only' })),
          env.DB.prepare(`INSERT OR IGNORE INTO crm_campaign_targets (id,campaign_id,account_id,priority,research_status,notes) VALUES (?,?,?,?, 'queued',?)`)
            .bind(id('target'), campaignId, accountId, score, `Descoberto automaticamente em fonte pública: ${source.name}`),
          env.DB.prepare(`INSERT INTO crm_tasks (id,account_id,task_type,title,status,priority,approval_required,due_at,metadata_json)
            VALUES (?,?,'account_research',?,'open',?,0,datetime('now','+1 day'),?)`)
            .bind(id('task'), accountId, `Pesquisar empresa descoberta: ${item.name}`, score, JSON.stringify({ campaignId, publicSourcesOnly: true, noOutbound: true, scoutSourceId: source.id })),
          env.DB.prepare(`INSERT INTO crm_agent_jobs (id,agent_key,status,input_json,scheduled_at) VALUES (?,'researcher','queued',?,CURRENT_TIMESTAMP)`)
            .bind(id('job'), JSON.stringify({ accountId, campaignId, company: item.name, website: item.website, sourceUrl: item.website, policy: 'public_sources_only', scoutSourceId: source.id })),
          env.DB.prepare("UPDATE crm_scout_candidates SET status='queued',account_id=?,last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(accountId, candidateId)
        ]);
        created += 1;
        findings.push({ name: item.name, website: item.website, accountId });
      }
      await env.DB.prepare('UPDATE crm_scout_sources SET last_scanned_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(source.id).run();
    } catch (error) {
      findings.push({ source: source.name, error: clean(error?.message || 'scout_error', 180) });
      await env.DB.prepare('UPDATE crm_scout_sources SET last_scanned_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(source.id).run();
    }
  }
  return { discovered, created, findings, noOutbound: true };
}

function internalCandidateLinks(page) {
  const host = hostKey(page.url);
  const scored = new Map();
  for (const anchor of extractAnchors(page.raw, page.url)) {
    if (anchor.host !== host) continue;
    const key = norm(`${anchor.text} ${new URL(anchor.url).pathname}`);
    const score = INTERNAL_HINTS.reduce((sum, hint) => sum + (key.includes(norm(hint)) ? 1 : 0), 0);
    if (!score) continue;
    const normalized = anchor.url.split('#')[0];
    if (!scored.has(normalized) || scored.get(normalized).score < score) scored.set(normalized, { url: normalized, score });
  }
  return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 4).map((row) => row.url);
}
function evidenceContains(text, value) {
  const needle = norm(value);
  return needle.length >= 3 && norm(text).includes(needle);
}

async function enrichDecisionMakers(env, limit = 3) {
  const max = Math.max(1, Math.min(6, Number(limit || 3)));
  const accounts = await env.DB.prepare(`
    SELECT a.* FROM crm_accounts a
    LEFT JOIN crm_account_enrichment e ON e.account_id=a.id
    WHERE COALESCE(a.website,'')<>''
      AND a.status IN ('researched','qualified','hot_lead','researching')
      AND (e.last_attempt_at IS NULL OR e.last_attempt_at < datetime('now','-7 day'))
      AND NOT EXISTS (
        SELECT 1 FROM crm_contacts c
        WHERE c.account_id=a.id AND c.source='official_website'
          AND COALESCE(json_extract(c.metadata_json,'$.genericContact'),0)<>1
      )
    ORDER BY a.icp_score DESC,a.updated_at ASC
    LIMIT ?
  `).bind(max).all();
  const results = [];
  for (const account of accounts.results) {
    const sources = [];
    try {
      const home = await fetchPage(account.website, 8000);
      sources.push(home);
      for (const url of internalCandidateLinks(home).slice(0, 3)) {
        if (url === home.url) continue;
        try { sources.push(await fetchPage(url, 7000)); } catch (error) {
          console.error('decision_maker_page_error', { accountId: account.id, url, message: error?.message });
        }
      }
      const combinedText = sources.map((source) => `FONTE ${source.url}\n${source.text}`).join('\n\n').slice(0, 95_000);
      const combinedRaw = sources.map((source) => source.raw).join('\n').slice(0, 300_000);
      const emails = publicEmails(combinedRaw);
      let people = [];
      if (env.AI?.run) {
        const prompt = `Você é o agente de pesquisa de decisores de uma operação B2B. Analise SOMENTE as páginas públicas oficiais abaixo. Não invente pessoas, cargos, emails ou URLs. Retorne SOMENTE JSON válido com a chave people, um array de até 8 objetos {name, role, email}. Inclua apenas pessoas cujo NOME e CARGO aparecem literalmente no material. Dê preferência a liderança de Tecnologia, Digital, Dados, Inovação, Operações, Projetos, Produto, Transformação, Estratégia e diretoria executiva. Email só pode ser retornado se aparecer literalmente.\nEmpresa: ${account.name}\n${combinedText}`;
        const parsed = extractJson(extractText(await env.AI.run('@cf/zai-org/glm-4.7-flash', { prompt, max_tokens: 1600 })));
        if (Array.isArray(parsed?.people)) people = parsed.people;
      }
      const validPeople = people.slice(0, 8)
        .map((person) => ({ name: clean(person?.name, 180), role: clean(person?.role, 180), email: clean(person?.email, 240).toLowerCase() }))
        .filter((person) => person.name.split(/\s+/).length >= 2 && person.role.length >= 3)
        .filter((person) => evidenceContains(combinedText, person.name) && evidenceContains(combinedText, person.role))
        .map((person) => ({ ...person, email: person.email && emails.includes(person.email) ? person.email : '' }));

      let created = 0;
      for (const person of validPeople) {
        const existing = await env.DB.prepare('SELECT id FROM crm_contacts WHERE account_id=? AND lower(name)=lower(?) LIMIT 1').bind(account.id, person.name).first();
        if (existing) continue;
        await env.DB.prepare(`INSERT INTO crm_contacts (id,account_id,name,email,role,language,status,source,consent_status,metadata_json)
          VALUES (?,?,?,?,?,'pt','researched','official_website','unknown',?)`)
          .bind(id('contact'), account.id, person.name, person.email, person.role, JSON.stringify({ publicSource: true, evidenceUrls: sources.map((source) => source.url), enrichedBy: 'decision_maker_researcher' })).run();
        created += 1;
      }
      if (created) {
        const queued = await env.DB.prepare("SELECT id FROM crm_agent_jobs WHERE agent_key='qualifier' AND status IN ('queued','running') AND input_json LIKE ? LIMIT 1").bind(`%${account.id}%`).first();
        if (!queued) {
          await env.DB.prepare(`INSERT INTO crm_agent_jobs (id,agent_key,status,input_json,scheduled_at) VALUES (?,'qualifier','queued',?,CURRENT_TIMESTAMP)`)
            .bind(id('job'), JSON.stringify({ accountId: account.id, policy: 'public_sources_only', trigger: 'decision_maker_enrichment' })).run();
        }
      }
      await env.DB.prepare(`INSERT INTO crm_account_enrichment (account_id,status,last_attempt_at,last_success_at,sources_json,output_json,error_message,updated_at)
        VALUES (?,'completed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,'',CURRENT_TIMESTAMP)
        ON CONFLICT(account_id) DO UPDATE SET status='completed',last_attempt_at=CURRENT_TIMESTAMP,last_success_at=CURRENT_TIMESTAMP,sources_json=excluded.sources_json,output_json=excluded.output_json,error_message='',updated_at=CURRENT_TIMESTAMP`)
        .bind(account.id, JSON.stringify(sources.map((source) => source.url)), JSON.stringify({ contactsCreated: created, peopleFound: validPeople.length, publicEmails: emails.slice(0, 5) })).run();
      results.push({ accountId: account.id, company: account.name, contactsCreated: created, pagesRead: sources.length });
    } catch (error) {
      await env.DB.prepare(`INSERT INTO crm_account_enrichment (account_id,status,last_attempt_at,sources_json,output_json,error_message,updated_at)
        VALUES (?,'retry',CURRENT_TIMESTAMP,'[]','{}',?,CURRENT_TIMESTAMP)
        ON CONFLICT(account_id) DO UPDATE SET status='retry',last_attempt_at=CURRENT_TIMESTAMP,error_message=excluded.error_message,updated_at=CURRENT_TIMESTAMP`)
        .bind(account.id, clean(error?.message || 'enrichment_error', 500)).run();
      results.push({ accountId: account.id, company: account.name, error: clean(error?.message || 'enrichment_error', 180) });
    }
  }
  return { processed: results.length, results, noOutbound: true };
}

async function queueIntentRechecks(env, limit = 8) {
  const accounts = await env.DB.prepare(`
    SELECT DISTINCT a.id,a.name FROM crm_accounts a
    JOIN crm_contacts c ON c.account_id=a.id AND c.consent_status<>'denied'
    WHERE EXISTS (SELECT 1 FROM crm_signals s WHERE s.account_id=a.id AND s.observed_at>=datetime('now','-14 day'))
      AND EXISTS (
        SELECT 1 FROM crm_contacts c2
        WHERE c2.account_id=a.id
          AND COALESCE((SELECT MAX(sc.created_at) FROM crm_scores sc WHERE sc.contact_id=c2.id),'1970-01-01')
              < COALESCE((SELECT MAX(s2.observed_at) FROM crm_signals s2 WHERE s2.account_id=a.id),'1970-01-01')
      )
    ORDER BY a.icp_score DESC
    LIMIT ?
  `).bind(Math.max(1, Math.min(20, Number(limit || 8)))).all();
  let queued = 0;
  for (const account of accounts.results) {
    const exists = await env.DB.prepare("SELECT id FROM crm_agent_jobs WHERE agent_key='qualifier' AND status IN ('queued','running') AND input_json LIKE ? LIMIT 1").bind(`%${account.id}%`).first();
    if (exists) continue;
    await env.DB.prepare(`INSERT INTO crm_agent_jobs (id,agent_key,status,input_json,scheduled_at) VALUES (?,'qualifier','queued',?,CURRENT_TIMESTAMP)`)
      .bind(id('job'), JSON.stringify({ accountId: account.id, policy: 'public_sources_only', trigger: 'intent_monitor' })).run();
    queued += 1;
  }
  return { scanned: accounts.results.length, queued };
}

async function refreshStaleResearch(env, limit = 4) {
  const accounts = await env.DB.prepare(`
    SELECT a.id,a.name,a.website,a.metadata_json,t.campaign_id
    FROM crm_accounts a
    JOIN crm_campaign_targets t ON t.account_id=a.id
    WHERE t.research_status='completed'
      AND NOT EXISTS (SELECT 1 FROM crm_signals s WHERE s.account_id=a.id AND s.observed_at>=datetime('now','-14 day'))
      AND NOT EXISTS (SELECT 1 FROM crm_agent_jobs j WHERE j.agent_key='researcher' AND j.status IN ('queued','running') AND j.input_json LIKE '%' || a.id || '%')
    ORDER BY a.icp_score DESC,a.updated_at ASC
    LIMIT ?
  `).bind(Math.max(1, Math.min(10, Number(limit || 4)))).all();
  let queued = 0;
  for (const account of accounts.results) {
    const meta = parseJson(account.metadata_json, {});
    await env.DB.prepare(`INSERT INTO crm_agent_jobs (id,agent_key,status,input_json,scheduled_at) VALUES (?,'researcher','queued',?,CURRENT_TIMESTAMP)`)
      .bind(id('job'), JSON.stringify({ accountId: account.id, campaignId: account.campaign_id, company: account.name, website: account.website, sourceUrl: meta.sourceUrl || account.website, policy: 'public_sources_only', trigger: 'stale_refresh' })).run();
    queued += 1;
  }
  return { queued };
}

export async function runProspectingMaintenance(env) {
  const scout = await runMarketScout(env, 6);
  const decisionMakers = await enrichDecisionMakers(env, 3);
  const intentMonitor = await queueIntentRechecks(env, 8);
  const refresh = await refreshStaleResearch(env, 4);
  return {
    scout,
    decisionMakers,
    intentMonitor,
    refresh,
    policy: 'public_sources_only',
    noOutbound: true,
    externalContactRequiresHumanApproval: true
  };
}

export async function handleProspectingMaintenanceRoute(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/prospecting-maintenance')) return null;
  if (!isRobot(request, env)) return json({ error: 'unauthorized' }, { status: 401 });
  if (request.method === 'POST' && path === '/api/prospecting-maintenance/run') return json(await runProspectingMaintenance(env));
  return json({ error: 'not_found' }, { status: 404 });
}

export { runMarketScout, enrichDecisionMakers, queueIntentRechecks, refreshStaleResearch };
