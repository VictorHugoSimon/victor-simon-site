import { bearerToken, id, json, normalizeText, parseJson, verifyToken } from './lib.mjs';

const AGENTS = [
  ['icp-planner', 'ICP Planner', 'Define segmento, oferta e critérios de aderência.'],
  ['market-scout', 'Market Scout', 'Organiza empresas-alvo a partir de fontes permitidas.'],
  ['researcher', 'Researcher', 'Registra evidências públicas sem scraping de áreas restritas.'],
  ['qualifier', 'Qualifier', 'Calcula fit, intenção, autoridade e timing.'],
  ['personalizer', 'Personalizer', 'Prepara abordagem contextual para aprovação humana.'],
  ['nurture', 'Nurture', 'Sugere cadência e conteúdo, sem envio autônomo.'],
  ['intent-monitor', 'Intent Monitor', 'Prioriza sinais de interesse e engajamento consentido.'],
  ['handoff', 'Human Handoff', 'Entrega somente leads quentes com evidências.'],
  ['compliance', 'Compliance', 'Bloqueia opt-out, falta de consentimento e ações de risco.']
];

async function requireAdmin(request, env) {
  return (await verifyToken(bearerToken(request), env.AUTH_SECRET)) ? null : json({ error: 'unauthorized' }, { status: 401 });
}

function clean(value, max = 500) { return normalizeText(value, max); }
function clamp(value) { return Math.max(0, Math.min(100, Number(value || 0))); }
function parseMetadata(value) { try { return JSON.parse(value || '{}'); } catch { return {}; } }

async function summary(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const [accounts, contacts, hot, tasks, jobs] = await env.DB.batch([
    env.DB.prepare('SELECT status, COUNT(*) total FROM crm_accounts GROUP BY status'),
    env.DB.prepare('SELECT status, COUNT(*) total FROM crm_contacts GROUP BY status'),
    env.DB.prepare(`SELECT COUNT(*) total FROM crm_contacts c JOIN crm_scores s ON s.id = (SELECT id FROM crm_scores WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) WHERE s.total >= 80 AND c.consent_status != 'denied'`),
    env.DB.prepare("SELECT COUNT(*) total FROM crm_tasks WHERE status = 'open'"),
    env.DB.prepare("SELECT status, COUNT(*) total FROM crm_agent_jobs GROUP BY status")
  ]);
  return json({ accounts: accounts.results, contacts: contacts.results, hot: Number(hot.results?.[0]?.total || 0), openTasks: Number(tasks.results?.[0]?.total || 0), jobs: jobs.results });
}

async function listAccounts(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare('SELECT * FROM crm_accounts ORDER BY icp_score DESC, updated_at DESC LIMIT 200').all();
  return json({ accounts: result.results.map((row) => ({ ...row, metadata: parseMetadata(row.metadata_json) })) });
}

async function createAccount(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 30_000); const name = clean(body.name, 180);
  if (name.length < 2) return json({ error: 'validation_error' }, { status: 422 });
  const accountId = id('account');
  await env.DB.prepare(`INSERT INTO crm_accounts (id,name,website,industry,region,offer_key,icp_score,status,source,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(accountId, name, clean(body.website, 600), clean(body.industry, 120), clean(body.region, 120), clean(body.offerKey, 100), clamp(body.icpScore), clean(body.status || 'target', 40), clean(body.source || 'manual', 80), JSON.stringify(body.metadata || {})).run();
  return json({ id: accountId }, { status: 201 });
}

async function listContacts(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare(`SELECT c.*, a.name account_name, (SELECT total FROM crm_scores WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 1) score FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id=c.account_id ORDER BY COALESCE(score,0) DESC, c.updated_at DESC LIMIT 300`).all();
  return json({ contacts: result.results.map((row) => ({ ...row, metadata: parseMetadata(row.metadata_json) })) });
}

async function createContact(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 30_000); const name = clean(body.name, 180);
  if (name.length < 2) return json({ error: 'validation_error' }, { status: 422 });
  const contactId = id('contact');
  await env.DB.prepare(`INSERT INTO crm_contacts (id,account_id,name,email,phone,linkedin_url,role,seniority,language,status,source,consent_status,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(contactId, clean(body.accountId, 100) || null, name, clean(body.email, 240), clean(body.phone, 60), clean(body.linkedinUrl, 600), clean(body.role, 160), clean(body.seniority, 80), body.language === 'en' ? 'en' : 'pt', clean(body.status || 'researching', 40), clean(body.source || 'manual', 80), clean(body.consentStatus || 'unknown', 40), JSON.stringify(body.metadata || {})).run();
  return json({ id: contactId }, { status: 201 });
}

async function scoreContact(request, env, contactId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 20_000);
  const contact = await env.DB.prepare('SELECT id, consent_status FROM crm_contacts WHERE id=?').bind(contactId).first();
  if (!contact) return json({ error: 'not_found' }, { status: 404 });
  const values = { icpFit: clamp(body.icpFit), intent: clamp(body.intent), engagement: clamp(body.engagement), authority: clamp(body.authority), timing: clamp(body.timing) };
  const total = Math.round(values.icpFit * .30 + values.intent * .25 + values.engagement * .15 + values.authority * .20 + values.timing * .10);
  await env.DB.prepare('INSERT INTO crm_scores (id,contact_id,icp_fit,intent,engagement,authority,timing,total,explanation_json) VALUES (?,?,?,?,?,?,?,?,?)').bind(id('score'), contactId, values.icpFit, values.intent, values.engagement, values.authority, values.timing, total, JSON.stringify(body.evidence || {})).run();
  const hot = total >= 80 && contact.consent_status !== 'denied';
  if (hot) {
    await env.DB.prepare(`UPDATE crm_contacts SET status='hot_lead', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(contactId).run();
    await env.DB.prepare(`INSERT INTO crm_tasks (id,contact_id,task_type,title,status,priority,approval_required,metadata_json) VALUES (?,?,'human_handoff','Revisar lead quente','open',?,?,?)`).bind(id('task'), contactId, total, 1, JSON.stringify({ score: total, outboundBlocked: true })).run();
  }
  return json({ contactId, score: total, hot, requiresHumanApproval: true });
}

async function hotLeads(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare(`SELECT c.id,c.name,c.email,c.role,c.linkedin_url,c.consent_status,a.name account_name,s.total score,s.explanation_json,s.created_at scored_at FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id=c.account_id JOIN crm_scores s ON s.id=(SELECT id FROM crm_scores WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 1) WHERE s.total>=80 AND c.consent_status!='denied' ORDER BY s.total DESC,s.created_at DESC LIMIT 100`).all();
  return json({ leads: result.results.map((row) => ({ ...row, evidence: parseMetadata(row.explanation_json), contactPolicy: 'human_approval_required' })) });
}

async function agents(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare('SELECT agent_key,status,COUNT(*) total,MAX(created_at) last_run FROM crm_agent_jobs GROUP BY agent_key,status').all();
  return json({ agents: AGENTS.map(([key, name, purpose]) => ({ key, name, purpose, mode: 'assistive', outbound: false, runs: result.results.filter((row) => row.agent_key === key) })) });
}

export async function handleProspectingRoute(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/prospecting')) return null;
  if (request.method === 'GET' && path === '/api/prospecting/summary') return summary(request, env);
  if (request.method === 'GET' && path === '/api/prospecting/accounts') return listAccounts(request, env);
  if (request.method === 'POST' && path === '/api/prospecting/accounts') return createAccount(request, env);
  if (request.method === 'GET' && path === '/api/prospecting/contacts') return listContacts(request, env);
  if (request.method === 'POST' && path === '/api/prospecting/contacts') return createContact(request, env);
  if (request.method === 'GET' && path === '/api/prospecting/hot-leads') return hotLeads(request, env);
  if (request.method === 'GET' && path === '/api/prospecting/agents') return agents(request, env);
  const match = path.match(/^\/api\/prospecting\/contacts\/([a-zA-Z0-9_-]+)\/score$/);
  if (request.method === 'POST' && match) return scoreContact(request, env, match[1]);
  return json({ error: 'not_found' }, { status: 404 });
}
