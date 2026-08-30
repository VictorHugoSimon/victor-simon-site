import { bearerToken, id, json, normalizeText, parseJson, verifyToken } from './lib.mjs';
import { handleSalesClosingRoute } from './sales-closing.mjs';

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

const OFFER_NAMES = {
  'diagnostico-executivo': 'Diagnóstico Executivo',
  'sprint-produto-delivery': 'Sprint de Produto & Delivery',
  'automacao-dados-ia': 'Automação, Dados & IA',
  'solucao-personalizada': 'Solução personalizada'
};

async function requireAdmin(request, env) {
  return (await verifyToken(bearerToken(request), env.AUTH_SECRET)) ? null : json({ error: 'unauthorized' }, { status: 401 });
}

function clean(value, max = 500) { return normalizeText(value, max); }
function clamp(value) { return Math.max(0, Math.min(100, Number(value || 0))); }
function parseMetadata(value) { try { return JSON.parse(value || '{}'); } catch { return {}; } }
function moneyValue(value) { const number = Number(value || 0); return Number.isFinite(number) ? Math.max(0, number) : 0; }
function offerName(key) { return OFFER_NAMES[key] || 'consultoria em projetos, produto, dados e automação'; }
function firstName(name) { return clean(name, 180).split(/\s+/)[0] || 'Olá'; }

async function summary(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const [accounts, contacts, hot, tasks, jobs, opportunities] = await env.DB.batch([
    env.DB.prepare('SELECT status, COUNT(*) total FROM crm_accounts GROUP BY status'),
    env.DB.prepare('SELECT status, COUNT(*) total FROM crm_contacts GROUP BY status'),
    env.DB.prepare(`SELECT COUNT(*) total FROM crm_contacts c JOIN crm_scores s ON s.id = (SELECT id FROM crm_scores WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) WHERE s.total >= 80 AND c.consent_status != 'denied'`),
    env.DB.prepare("SELECT COUNT(*) total FROM crm_tasks WHERE status = 'open'"),
    env.DB.prepare('SELECT status, COUNT(*) total FROM crm_agent_jobs GROUP BY status'),
    env.DB.prepare("SELECT COUNT(*) total, COALESCE(SUM(estimated_value),0) pipeline_value, COALESCE(SUM(estimated_value * probability / 100.0),0) weighted_pipeline FROM crm_opportunities WHERE status='open'")
  ]);
  const opportunityStats = opportunities.results?.[0] || {};
  return json({
    accounts: accounts.results,
    contacts: contacts.results,
    hot: Number(hot.results?.[0]?.total || 0),
    openTasks: Number(tasks.results?.[0]?.total || 0),
    jobs: jobs.results,
    opportunities: Number(opportunityStats.total || 0),
    pipelineValue: Number(opportunityStats.pipeline_value || 0),
    weightedPipeline: Number(opportunityStats.weighted_pipeline || 0)
  });
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
  const result = await env.DB.prepare(`SELECT c.id,c.name,c.email,c.phone,c.role,c.linkedin_url,c.language,c.consent_status,a.name account_name,a.offer_key,s.total score,s.explanation_json,s.created_at scored_at FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id=c.account_id JOIN crm_scores s ON s.id=(SELECT id FROM crm_scores WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 1) WHERE s.total>=80 AND c.consent_status!='denied' ORDER BY s.total DESC,s.created_at DESC LIMIT 100`).all();
  return json({ leads: result.results.map((row) => ({ ...row, evidence: parseMetadata(row.explanation_json), contactPolicy: 'human_approval_required' })) });
}

async function listOpportunities(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare(`
    SELECT o.*, c.name contact_name, c.email, c.phone, c.linkedin_url, c.role,
      a.name account_name,
      COALESCE((SELECT total FROM crm_scores WHERE contact_id=o.contact_id ORDER BY created_at DESC LIMIT 1),0) score,
      (SELECT COUNT(*) FROM crm_message_drafts d WHERE d.opportunity_id=o.id AND d.status IN ('draft','approved')) active_drafts
    FROM crm_opportunities o
    JOIN crm_contacts c ON c.id=o.contact_id
    LEFT JOIN crm_accounts a ON a.id=o.account_id
    ORDER BY CASE o.stage WHEN 'proposal' THEN 1 WHEN 'negotiation' THEN 2 WHEN 'discovery' THEN 3 ELSE 4 END,
      o.probability DESC, COALESCE(o.next_action_due_at,o.updated_at) ASC
    LIMIT 200
  `).all();
  return json({ opportunities: result.results.map((row) => ({ ...row, metadata: parseMetadata(row.metadata_json) })) });
}

async function handoffOpportunity(request, env, contactId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 20_000);
  const contact = await env.DB.prepare(`
    SELECT c.*, a.name account_name, a.offer_key,
      COALESCE((SELECT total FROM crm_scores WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 1),0) score,
      (SELECT explanation_json FROM crm_scores WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 1) evidence_json
    FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id=c.account_id WHERE c.id=?
  `).bind(contactId).first();
  if (!contact) return json({ error: 'not_found' }, { status: 404 });
  if (contact.consent_status === 'denied') return json({ error: 'contact_suppressed' }, { status: 409 });
  if (Number(contact.score || 0) < 80) return json({ error: 'not_hot_enough', score: Number(contact.score || 0) }, { status: 422 });

  const existing = await env.DB.prepare("SELECT id FROM crm_opportunities WHERE contact_id=? AND status='open' ORDER BY created_at DESC LIMIT 1").bind(contactId).first();
  if (existing) return json({ id: existing.id, existing: true, requiresHumanApproval: true });

  const opportunityId = id('opp');
  const offerKey = clean(body.offerKey || contact.offer_key || 'diagnostico-executivo', 100);
  const estimatedValue = moneyValue(body.estimatedValue);
  const probability = Math.max(20, Math.min(90, Math.round(Number(contact.score || 80) * .75)));
  const nextAction = clean(body.nextAction || 'Revisar abordagem e iniciar contato humano', 500);
  const dueAt = clean(body.nextActionDueAt, 80) || new Date(Date.now() + 86_400_000).toISOString();
  const metadata = { evidence: parseMetadata(contact.evidence_json), score: Number(contact.score || 0), requiresHumanApproval: true };

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO crm_opportunities (id,account_id,contact_id,offer_key,stage,estimated_value,probability,next_action,next_action_due_at,owner,status,source,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,'Victor Hugo','open','hot_lead_handoff',?)`)
      .bind(opportunityId, contact.account_id || null, contactId, offerKey, 'discovery', estimatedValue, probability, nextAction, dueAt, JSON.stringify(metadata)),
    env.DB.prepare(`UPDATE crm_contacts SET status='handoff_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(contactId),
    env.DB.prepare(`INSERT INTO crm_tasks (id,account_id,contact_id,task_type,title,status,priority,approval_required,due_at,metadata_json) VALUES (?,?,?,'sales_next_action',?,'open',?,?,?,?)`)
      .bind(id('task'), contact.account_id || null, contactId, `Avançar oportunidade: ${contact.name}`, Math.max(80, Number(contact.score || 0)), 1, dueAt, JSON.stringify({ opportunityId, nextAction, estimatedValue }))
  ]);
  return json({ id: opportunityId, stage: 'discovery', estimatedValue, probability, requiresHumanApproval: true }, { status: 201 });
}

function buildDraft(contact, channel, offerKey) {
  const name = firstName(contact.name);
  const company = clean(contact.account_name || 'sua empresa', 180);
  const role = clean(contact.role, 120);
  const offer = offerName(offerKey);
  const pt = contact.language !== 'en';
  if (channel === 'email') {
    return pt
      ? {
          subject: `${offer} para ${company}`,
          body: `Olá, ${name}. Tudo bem?\n\nAtuo estruturando projetos, produto, delivery, dados e automação para empresas que precisam transformar prioridades em execução mensurável. Pelo seu contexto${role ? ` como ${role}` : ''} na ${company}, acredito que pode fazer sentido conversar sobre ${offer}.\n\nSe houver aderência, posso apresentar em uma conversa curta como eu estruturaria diagnóstico, prioridades e próximos passos para o cenário de vocês.\n\nAbraço,\nVictor Hugo Simon`
        }
      : {
          subject: `${offer} for ${company}`,
          body: `Hi ${name},\n\nI work with project, product, delivery, data and automation initiatives that turn priorities into measurable execution. Based on your role${role ? ` as ${role}` : ''} at ${company}, I believe a conversation about ${offer} may be relevant.\n\nIf useful, I can walk you through how I would structure the assessment, priorities and next steps in a short call.\n\nBest,\nVictor Hugo Simon`
        };
  }
  if (channel === 'linkedin') {
    return pt
      ? { subject: '', body: `Olá, ${name}. Vi seu contexto na ${company} e atuo com ${offer}, conectando estratégia, tecnologia e execução. Se fizer sentido, gostaria de trocar uma ideia rápida sobre os desafios e prioridades de vocês. Abraço, Victor.` }
      : { subject: '', body: `Hi ${name}. I came across your work at ${company}. I work with ${offer}, connecting strategy, technology and execution. If relevant, I would be glad to exchange a few ideas about your current priorities. Best, Victor.` };
  }
  return pt
    ? { subject: '', body: `Olá, ${name}. Tudo bem? Sou Victor Hugo Simon. Atuo com ${offer}, ajudando empresas a organizar prioridades, execução e indicadores. Pelo contexto da ${company}, acredito que pode fazer sentido uma conversa rápida. Se você achar pertinente, posso te explicar como eu estruturaria os primeiros passos.` }
    : { subject: '', body: `Hi ${name}, how are you? I'm Victor Hugo Simon. I work with ${offer}, helping companies organize priorities, execution and metrics. Based on ${company}'s context, a quick conversation may be useful. If relevant, I can share how I would structure the first steps.` };
}

async function createMessageDraft(request, env, contactId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 20_000);
  const channel = ['whatsapp', 'linkedin', 'email'].includes(body.channel) ? body.channel : 'whatsapp';
  const contact = await env.DB.prepare(`
    SELECT c.*, a.name account_name, a.offer_key,
      COALESCE((SELECT total FROM crm_scores WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 1),0) score
    FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id=c.account_id WHERE c.id=?
  `).bind(contactId).first();
  if (!contact) return json({ error: 'not_found' }, { status: 404 });
  if (contact.consent_status === 'denied') return json({ error: 'contact_suppressed' }, { status: 409 });
  if (Number(contact.score || 0) < 80) return json({ error: 'not_hot_enough', score: Number(contact.score || 0) }, { status: 422 });

  const opportunity = await env.DB.prepare("SELECT id,offer_key FROM crm_opportunities WHERE contact_id=? AND status='open' ORDER BY created_at DESC LIMIT 1").bind(contactId).first();
  const offerKey = clean(body.offerKey || opportunity?.offer_key || contact.offer_key || 'diagnostico-executivo', 100);
  const existing = await env.DB.prepare("SELECT id,status FROM crm_message_drafts WHERE contact_id=? AND channel=? AND status='draft' ORDER BY created_at DESC LIMIT 1").bind(contactId, channel).first();
  if (existing) return json({ id: existing.id, status: existing.status, existing: true, requiresHumanApproval: true });

  const draft = buildDraft(contact, channel, offerKey);
  const draftId = id('draft');
  await env.DB.prepare(`INSERT INTO crm_message_drafts (id,opportunity_id,contact_id,channel,purpose,subject,body,status,approval_required,metadata_json) VALUES (?,?,?,?,?,?,?,'draft',1,?)`)
    .bind(draftId, opportunity?.id || null, contactId, channel, 'first_contact', draft.subject, draft.body, JSON.stringify({ score: Number(contact.score || 0), offerKey, outboundBlocked: true })).run();
  return json({ id: draftId, channel, subject: draft.subject, body: draft.body, status: 'draft', requiresHumanApproval: true }, { status: 201 });
}

async function listMessageDrafts(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare(`
    SELECT d.*, c.name contact_name, c.email, c.phone, c.linkedin_url, a.name account_name
    FROM crm_message_drafts d
    JOIN crm_contacts c ON c.id=d.contact_id
    LEFT JOIN crm_accounts a ON a.id=c.account_id
    ORDER BY CASE d.status WHEN 'draft' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, d.created_at DESC
    LIMIT 200
  `).all();
  return json({ drafts: result.results.map((row) => ({ ...row, metadata: parseMetadata(row.metadata_json), requiresHumanApproval: true })) });
}

async function updateMessageDraft(request, env, draftId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 8_000);
  const status = clean(body.status, 20);
  if (!['approved', 'rejected', 'draft'].includes(status)) return json({ error: 'invalid_status' }, { status: 422 });
  const current = await env.DB.prepare('SELECT id FROM crm_message_drafts WHERE id=?').bind(draftId).first();
  if (!current) return json({ error: 'not_found' }, { status: 404 });
  if (status === 'approved') {
    await env.DB.prepare("UPDATE crm_message_drafts SET status='approved',approved_at=CURRENT_TIMESTAMP,rejected_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(draftId).run();
  } else if (status === 'rejected') {
    await env.DB.prepare("UPDATE crm_message_drafts SET status='rejected',rejected_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(draftId).run();
  } else {
    await env.DB.prepare("UPDATE crm_message_drafts SET status='draft',approved_at=NULL,rejected_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(draftId).run();
  }
  return json({ id: draftId, status, outboundSent: false, requiresHumanApproval: true });
}

async function agents(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare('SELECT agent_key,status,COUNT(*) total,MAX(created_at) last_run FROM crm_agent_jobs GROUP BY agent_key,status').all();
  return json({ agents: AGENTS.map(([key, name, purpose]) => ({ key, name, purpose, mode: 'assistive', outbound: false, runs: result.results.filter((row) => row.agent_key === key) })) });
}

export async function handleProspectingRoute(request, env) {
  const salesClosing = await handleSalesClosingRoute(request, env);
  if (salesClosing) return salesClosing;

  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/prospecting')) return null;
  if (request.method === 'GET' && path === '/api/prospecting/summary') return summary(request, env);
  if (request.method === 'GET' && path === '/api/prospecting/accounts') return listAccounts(request, env);
  if (request.method === 'POST' && path === '/api/prospecting/accounts') return createAccount(request, env);
  if (request.method === 'GET' && path === '/api/prospecting/contacts') return listContacts(request, env);
  if (request.method === 'POST' && path === '/api/prospecting/contacts') return createContact(request, env);
  if (request.method === 'GET' && path === '/api/prospecting/hot-leads') return hotLeads(request, env);
  if (request.method === 'GET' && path === '/api/prospecting/agents') return agents(request, env);
  if (request.method === 'GET' && path === '/api/prospecting/opportunities') return listOpportunities(request, env);
  if (request.method === 'GET' && path === '/api/prospecting/drafts') return listMessageDrafts(request, env);

  const scoreMatch = path.match(/^\/api\/prospecting\/contacts\/([a-zA-Z0-9_-]+)\/score$/);
  if (request.method === 'POST' && scoreMatch) return scoreContact(request, env, scoreMatch[1]);
  const handoffMatch = path.match(/^\/api\/prospecting\/hot-leads\/([a-zA-Z0-9_-]+)\/handoff$/);
  if (request.method === 'POST' && handoffMatch) return handoffOpportunity(request, env, handoffMatch[1]);
  const draftContactMatch = path.match(/^\/api\/prospecting\/contacts\/([a-zA-Z0-9_-]+)\/draft$/);
  if (request.method === 'POST' && draftContactMatch) return createMessageDraft(request, env, draftContactMatch[1]);
  const draftMatch = path.match(/^\/api\/prospecting\/drafts\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'PATCH' && draftMatch) return updateMessageDraft(request, env, draftMatch[1]);
  return json({ error: 'not_found' }, { status: 404 });
}