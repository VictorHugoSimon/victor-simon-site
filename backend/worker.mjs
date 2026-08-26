import {
  bearerToken,
  createToken,
  id,
  json,
  normalizeText,
  parseJson,
  sha256,
  slugify,
  validateLead,
  verifyToken
} from './lib.mjs';
import { buildDossier, qualifyLead } from './qualify.mjs';
import { firstReply } from './chatbot.mjs';
import { handleGrowthRoute } from './growth.mjs';
import { handleGrowthAutomationRoute } from './growth-automation.mjs';

const publicPostRoutes = new Set(['/api/leads', '/api/events']);

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.CORS_ORIGIN || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origin) return configured[0] || '*';
  if (configured.includes(origin)) return origin;
  return configured.length === 0 ? origin : '';
}

function withHeaders(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = allowedOrigin(request, env);
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Robot-Key');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function isAdmin(request, env) {
  return Boolean(await verifyToken(bearerToken(request), env.AUTH_SECRET));
}

function isRobot(request, env) {
  const key = request.headers.get('X-Robot-Key') || bearerToken(request);
  return Boolean(env.ROBOT_KEY && key === env.ROBOT_KEY);
}

async function rateLimit(request, env, limit = 30, seconds = 300) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const path = new URL(request.url).pathname;
    const window = Math.floor(Date.now() / 1000 / seconds);
    const bucket = await sha256(`${ip}:${path}:${window}`);
    const expiresAt = (window + 1) * seconds;
    await env.DB.prepare(`
      INSERT INTO rate_limits (bucket, hits, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1
    `).bind(bucket, expiresAt).run();
    const result = await env.DB.prepare('SELECT hits FROM rate_limits WHERE bucket = ?').bind(bucket).first();
    return Number(result?.hits || 0) <= limit;
  } catch {
    return true;
  }
}

async function health(env) {
  const started = Date.now();
  try {
    await env.DB.prepare('SELECT 1 AS ok').first();
    return json({ status: 'ok', environment: env.ENVIRONMENT || 'unknown', database: 'ok', latencyMs: Date.now() - started });
  } catch (error) {
    return json({ status: 'degraded', environment: env.ENVIRONMENT || 'unknown', database: 'error' }, { status: 503 });
  }
}

async function login(request, env) {
  if (!(await rateLimit(request, env, 10, 600))) return json({ error: 'rate_limited' }, { status: 429 });
  const body = await parseJson(request, 4_000);
  const username = normalizeText(body.username, 80);
  const passwordHash = await sha256(body.password || '');
  const expectedUser = env.ADMIN_USERNAME || 'admin';
  if (!env.ADMIN_PASSWORD_HASH || username !== expectedUser || passwordHash !== env.ADMIN_PASSWORD_HASH) {
    return json({ error: 'invalid_credentials' }, { status: 401 });
  }
  return json({ token: await createToken({ sub: username, role: 'admin' }, env.AUTH_SECRET), expiresIn: 28_800 });
}

async function createLead(request, env) {
  if (!(await rateLimit(request, env, 20, 600))) return json({ error: 'rate_limited' }, { status: 429 });
  const body = await parseJson(request);
  const validation = validateLead(body);
  if (!validation.valid) return json({ error: 'validation_error', fields: validation.errors }, { status: 422 });

  const qualification = qualifyLead(validation.lead);
  const dossier = buildDossier(validation.lead, qualification);
  const leadId = id('lead');
  await env.DB.prepare(`
    INSERT INTO leads (
      id, name, email, phone, company, role, challenge, budget, deadline, authority,
      source, language, score, stage, dossier_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    leadId,
    validation.lead.name,
    validation.lead.email,
    validation.lead.phone,
    validation.lead.company,
    validation.lead.role,
    validation.lead.challenge,
    validation.lead.budget,
    validation.lead.deadline,
    validation.lead.authority,
    validation.lead.source,
    validation.lead.language,
    qualification.score,
    qualification.nextStage,
    JSON.stringify(dossier)
  ).run();
  await env.DB.prepare(`
    INSERT INTO lead_stage_history (id, lead_id, from_stage, to_stage, note)
    VALUES (?, ?, NULL, ?, ?)
  `).bind(id('history'), leadId, qualification.nextStage, 'Cadastro e qualificação automática').run();

  return json({ id: leadId, score: qualification.score, stage: qualification.nextStage, ready: qualification.ready }, { status: 201 });
}

async function listLeads(request, env) {
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const stage = normalizeText(url.searchParams.get('stage'), 40);
  const statement = stage
    ? env.DB.prepare('SELECT * FROM leads WHERE stage = ? ORDER BY created_at DESC LIMIT 200').bind(stage)
    : env.DB.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 200');
  const result = await statement.all();
  return json({ leads: result.results });
}

async function updateLead(request, env, leadId) {
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await parseJson(request, 8_000);
  const current = await env.DB.prepare('SELECT stage FROM leads WHERE id = ?').bind(leadId).first();
  if (!current) return json({ error: 'not_found' }, { status: 404 });
  const stage = normalizeText(body.stage || current.stage, 40);
  const allowedStages = ['new', 'nurturing', 'qualified', 'ready', 'proposal', 'won', 'lost'];
  if (!allowedStages.includes(stage)) return json({ error: 'invalid_stage' }, { status: 422 });
  const estimatedValue = Number.isFinite(Number(body.estimatedValue)) ? Math.max(0, Number(body.estimatedValue)) : 0;
  await env.DB.batch([
    env.DB.prepare('UPDATE leads SET stage = ?, estimated_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(stage, estimatedValue, leadId),
    env.DB.prepare('INSERT INTO lead_stage_history (id, lead_id, from_stage, to_stage, note) VALUES (?, ?, ?, ?, ?)')
      .bind(id('history'), leadId, current.stage, stage, normalizeText(body.note, 500))
  ]);
  return json({ id: leadId, stage, estimatedValue });
}

async function createEvent(request, env) {
  if (!(await rateLimit(request, env, 120, 300))) return json({ error: 'rate_limited' }, { status: 429 });
  const body = await parseJson(request, 10_000);
  const eventName = normalizeText(body.event, 80);
  if (!/^[a-z0-9_:-]{2,80}$/i.test(eventName)) return json({ error: 'invalid_event' }, { status: 422 });
  await env.DB.prepare(`
    INSERT INTO analytics_events (id, event_name, session_id, page, language, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id('event'),
    eventName,
    normalizeText(body.sessionId, 120),
    normalizeText(body.page, 200),
    body.language === 'en' ? 'en' : 'pt',
    JSON.stringify(body.metadata || {})
  ).run();
  return json({ accepted: true }, { status: 202 });
}

async function dashboard(request, env) {
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, { status: 401 });
  const [leadStats, stages, events, revenue, ready] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) total, COALESCE(AVG(score), 0) avg_score, COALESCE(SUM(estimated_value), 0) pipeline FROM leads'),
    env.DB.prepare('SELECT stage, COUNT(*) total FROM leads GROUP BY stage ORDER BY total DESC'),
    env.DB.prepare("SELECT event_name, COUNT(*) total FROM analytics_events WHERE created_at >= datetime('now', '-30 day') GROUP BY event_name ORDER BY total DESC LIMIT 20"),
    env.DB.prepare('SELECT COALESCE(SUM(amount), 0) actual FROM revenue_actuals'),
    env.DB.prepare('SELECT COUNT(*) total FROM leads WHERE score >= 70 AND stage NOT IN (\'won\', \'lost\')')
  ]);
  return json({
    leads: leadStats.results[0] || {},
    stages: stages.results,
    events: events.results,
    revenue: revenue.results[0] || {},
    ready: Number(ready.results[0]?.total || 0)
  });
}

async function posts(request, env) {
  const url = new URL(request.url);
  const language = url.searchParams.get('lang') === 'en' ? 'en' : 'pt';
  const result = await env.DB.prepare(`
    SELECT id, slug, language, title, excerpt, content, category, published_at
    FROM posts WHERE status = 'published' AND language = ?
    ORDER BY published_at DESC LIMIT 100
  `).bind(language).all();
  return json({ posts: result.results }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}

async function createPost(request, env) {
  if (!isRobot(request, env)) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await parseJson(request, 200_000);
  const title = normalizeText(body.title, 180);
  const content = String(body.content || '').trim().slice(0, 150_000);
  const language = body.language === 'en' ? 'en' : 'pt';
  if (title.length < 8 || content.length < 300) return json({ error: 'invalid_post' }, { status: 422 });
  const negatives = await env.DB.prepare("SELECT keyword FROM seo_keywords WHERE status = 'negative'").all();
  const normalizedContent = `${title} ${content}`.toLowerCase();
  const blocked = negatives.results.find((item) => normalizedContent.includes(String(item.keyword).toLowerCase()));
  if (blocked) return json({ error: 'negative_keyword', keyword: blocked.keyword }, { status: 422 });
  const postId = id('post');
  const slug = `${slugify(body.slug || title)}-${postId.slice(-8)}`;
  await env.DB.prepare(`
    INSERT INTO posts (id, slug, language, title, excerpt, content, category, keywords_json, status, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP)
  `).bind(
    postId, slug, language, title, normalizeText(body.excerpt, 320), content,
    normalizeText(body.category, 80), JSON.stringify(body.keywords || [])
  ).run();
  return json({ id: postId, slug }, { status: 201 });
}

async function seoKeywords(env) {
  const result = await env.DB.prepare(`
    SELECT keyword, language, category, status FROM seo_keywords ORDER BY language, keyword
  `).all();
  return json({ keywords: result.results }, { headers: { 'Cache-Control': 'public, max-age=600' } });
}

async function readyLeads(request, env) {
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, { status: 401 });
  const result = await env.DB.prepare(`
    SELECT id, name, email, phone, company, challenge, score, stage, dossier_json, created_at
    FROM leads WHERE score >= 70 AND stage NOT IN ('won', 'lost')
    ORDER BY score DESC, created_at DESC LIMIT 100
  `).all();
  return json({ leads: result.results.map((lead) => ({ ...lead, dossier: lead.dossier_json ? JSON.parse(lead.dossier_json) : null })) });
}

async function conversations(request, env) {
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, { status: 401 });
  const result = await env.DB.prepare(`
    SELECT c.*, COUNT(m.id) message_count, MAX(m.created_at) last_message_at
    FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
    GROUP BY c.id ORDER BY COALESCE(last_message_at, c.created_at) DESC LIMIT 100
  `).all();
  return json({ conversations: result.results });
}

async function nurtureDue(request, env) {
  if (!isRobot(request, env)) return json({ error: 'unauthorized' }, { status: 401 });
  const result = await env.DB.prepare(`
    SELECT * FROM leads
    WHERE stage = 'nurturing' AND nurture_touches < 4
    ORDER BY created_at LIMIT 100
  `).all();
  return json({ leads: result.results });
}

async function nurtureSent(request, env) {
  if (!isRobot(request, env)) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await parseJson(request, 8_000);
  const leadId = normalizeText(body.leadId, 100);
  const touchKey = normalizeText(body.touchKey, 80);
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO nurture_log (id, lead_id, touch_key, channel, status) VALUES (?, ?, ?, ?, ?)')
      .bind(id('nurture'), leadId, touchKey, normalizeText(body.channel || 'email', 40), 'sent'),
    env.DB.prepare('UPDATE leads SET nurture_touches = nurture_touches + 1, last_nurture_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(leadId)
  ]);
  return json({ updated: true });
}

async function webhook(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    return mode === 'subscribe' && token && token === env.VERIFY_TOKEN
      ? new Response(challenge || '', { status: 200 })
      : json({ error: 'verification_failed' }, { status: 403 });
  }
  const body = await parseJson(request, 100_000);
  const externalId = normalizeText(body.externalId || body.entry?.[0]?.id || 'unknown', 160);
  const messageText = normalizeText(body.message || JSON.stringify(body).slice(0, 2_000), 4_000);
  let conversation = await env.DB.prepare('SELECT id FROM conversations WHERE channel = ? AND external_id = ? LIMIT 1')
    .bind('meta', externalId).first();
  if (!conversation) {
    conversation = { id: id('conversation') };
    await env.DB.prepare('INSERT INTO conversations (id, channel, external_id, language) VALUES (?, ?, ?, ?)')
      .bind(conversation.id, 'meta', externalId, firstReply(messageText).language).run();
  }
  await env.DB.prepare('INSERT INTO messages (id, conversation_id, direction, body, metadata_json) VALUES (?, ?, ?, ?, ?)')
    .bind(id('message'), conversation.id, 'inbound', messageText, JSON.stringify(body)).run();
  return json({ received: true }, { status: 202 });
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const automationResponse = await handleGrowthAutomationRoute(request, env);
  if (automationResponse) return automationResponse;
  const growthResponse = await handleGrowthRoute(request, env);
  if (growthResponse) return growthResponse;
  if (request.method === 'GET' && path === '/api/health') return health(env);
  if (request.method === 'POST' && path === '/api/auth/login') return login(request, env);
  if (request.method === 'POST' && path === '/api/leads') return createLead(request, env);
  if (request.method === 'GET' && path === '/api/leads') return listLeads(request, env);
  if (request.method === 'POST' && path === '/api/events') return createEvent(request, env);
  if (request.method === 'GET' && path === '/api/dashboard') return dashboard(request, env);
  if (request.method === 'GET' && path === '/api/posts') return posts(request, env);
  if (request.method === 'POST' && path === '/api/posts') return createPost(request, env);
  if (request.method === 'GET' && path === '/api/seo/keywords') return seoKeywords(env);
  if (request.method === 'GET' && path === '/api/ready-leads') return readyLeads(request, env);
  if (request.method === 'GET' && path === '/api/conversations') return conversations(request, env);
  if (request.method === 'GET' && path === '/api/nurture/due') return nurtureDue(request, env);
  if (request.method === 'POST' && path === '/api/nurture/sent') return nurtureSent(request, env);
  if ((request.method === 'GET' || request.method === 'POST') && path === '/api/webhook') return webhook(request, env);

  const leadMatch = path.match(/^\/api\/leads\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'PATCH' && leadMatch) return updateLead(request, env, leadMatch[1]);
  return json({ error: 'not_found' }, { status: 404 });
}

export default {
  async fetch(request, env) {
    try {
      const origin = request.headers.get('Origin');
      if (origin && !allowedOrigin(request, env)) return withHeaders(json({ error: 'origin_not_allowed' }, { status: 403 }), request, env);
      const url = new URL(request.url);
      if (request.method === 'POST' && publicPostRoutes.has(url.pathname)) {
        const contentType = request.headers.get('Content-Type') || '';
        if (!contentType.includes('application/json')) return withHeaders(json({ error: 'content_type_required' }, { status: 415 }), request, env);
      }
      return withHeaders(await route(request, env), request, env);
    } catch (error) {
      const code = error?.message === 'PAYLOAD_TOO_LARGE' ? 413 : 500;
      console.error('worker_error', { message: error?.message, stack: error?.stack });
      return withHeaders(json({ error: code === 413 ? 'payload_too_large' : 'internal_error' }, { status: code }), request, env);
    }
  }
};
