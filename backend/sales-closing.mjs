import { bearerToken, id, json, normalizeText, parseJson, verifyToken } from './lib.mjs';

const STAGES = ['discovery', 'meeting', 'diagnosis', 'proposal', 'negotiation', 'won', 'lost'];
const STAGE_PROBABILITY = { discovery: 20, meeting: 35, diagnosis: 45, proposal: 60, negotiation: 80, won: 100, lost: 0 };

const OFFERS = {
  'diagnostico-executivo': {
    name: 'Diagnóstico Executivo',
    scope: ['Diagnóstico dos gargalos', 'Mapa de prioridades', 'Plano de ação de 30 dias'],
    payment: '50% na aprovação e 50% na entrega'
  },
  'sprint-produto-delivery': {
    name: 'Sprint de Produto & Delivery',
    scope: ['Discovery e alinhamento', 'Roadmap e backlog priorizado', 'Rituais, papéis e indicadores'],
    payment: '50% na aprovação e 50% na conclusão do sprint'
  },
  'automacao-dados-ia': {
    name: 'Automação, Dados & IA',
    scope: ['Mapeamento do processo', 'Protótipo de solução', 'Plano de implantação e escala'],
    payment: '40% na aprovação, 30% no protótipo e 30% na entrega'
  },
  'solucao-personalizada': {
    name: 'Solução Personalizada',
    scope: ['Diagnóstico inicial', 'Escopo priorizado', 'Plano de execução e governança'],
    payment: 'Condições definidas na aprovação do escopo'
  }
};

async function requireAdmin(request, env) {
  return (await verifyToken(bearerToken(request), env.AUTH_SECRET)) ? null : json({ error: 'unauthorized' }, { status: 401 });
}

function clean(value, max = 500) { return normalizeText(value, max); }
function moneyValue(value) { const number = Number(value || 0); return Number.isFinite(number) ? Math.max(0, number) : 0; }
function probability(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback;
}
function parseMetadata(value) { try { return JSON.parse(value || '{}'); } catch { return {}; } }
function isoAfterDays(days) { return new Date(Date.now() + days * 86_400_000).toISOString(); }

async function getOpportunity(env, opportunityId) {
  return env.DB.prepare(`
    SELECT o.*, c.name contact_name, c.email, c.phone, c.linkedin_url, c.role, c.language,
      a.name account_name
    FROM crm_opportunities o
    JOIN crm_contacts c ON c.id=o.contact_id
    LEFT JOIN crm_accounts a ON a.id=o.account_id
    WHERE o.id=? LIMIT 1
  `).bind(opportunityId).first();
}

async function updateOpportunity(request, env, opportunityId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 20_000);
  const current = await getOpportunity(env, opportunityId);
  if (!current) return json({ error: 'not_found' }, { status: 404 });

  const stage = clean(body.stage || current.stage, 30);
  if (!STAGES.includes(stage)) return json({ error: 'invalid_stage', allowed: STAGES }, { status: 422 });
  const estimatedValue = body.estimatedValue === undefined ? Number(current.estimated_value || 0) : moneyValue(body.estimatedValue);
  const stageDefault = STAGE_PROBABILITY[stage];
  const nextProbability = body.probability === undefined
    ? (stage === current.stage ? Number(current.probability || stageDefault) : stageDefault)
    : probability(body.probability, stageDefault);
  const nextAction = clean(body.nextAction || current.next_action || 'Definir próxima ação comercial', 500);
  const nextActionDueAt = clean(body.nextActionDueAt || current.next_action_due_at, 80) || isoAfterDays(2);
  const status = stage === 'won' ? 'won' : stage === 'lost' ? 'lost' : 'open';
  const note = clean(body.note || `Etapa comercial atualizada para ${stage}`, 600);

  const statements = [
    env.DB.prepare(`UPDATE crm_opportunities SET stage=?,estimated_value=?,probability=?,next_action=?,next_action_due_at=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(stage, estimatedValue, nextProbability, nextAction, nextActionDueAt, status, opportunityId)
  ];

  if (current.stage !== stage) {
    statements.push(env.DB.prepare(`INSERT INTO crm_opportunity_history (id,opportunity_id,from_stage,to_stage,note,metadata_json) VALUES (?,?,?,?,?,?)`)
      .bind(id('opp_history'), opportunityId, current.stage, stage, note, JSON.stringify({ probability: nextProbability, estimatedValue })));
  }

  if (stage === 'won' && current.stage !== 'won') {
    statements.push(env.DB.prepare(`INSERT INTO crm_tasks (id,account_id,contact_id,task_type,title,status,priority,approval_required,due_at,metadata_json) VALUES (?,?,?,'delivery_handoff',?,'open',100,0,datetime('now','+1 day'),?)`)
      .bind(id('task'), current.account_id || null, current.contact_id, `Iniciar entrega: ${current.account_name || current.contact_name}`, JSON.stringify({ opportunityId, estimatedValue })));
  }

  await env.DB.batch(statements);
  return json({ id: opportunityId, stage, status, estimatedValue, probability: nextProbability, nextAction, nextActionDueAt });
}

function proposalText(opportunity, definition, value, paymentTerms, validityDays) {
  const company = opportunity.account_name || opportunity.contact_name;
  const scopeLines = definition.scope.map((item) => `- ${item}`).join('\n');
  const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  if (opportunity.language === 'en') {
    return `COMMERCIAL PROPOSAL — ${definition.name}\n\nClient: ${company}\nContact: ${opportunity.contact_name}\n\nOBJECTIVE\nStructure a clear and executable path from the current business challenge to measurable delivery, connecting management, product, technology and data as applicable.\n\nSCOPE\n${scopeLines}\n\nINVESTMENT\n${formatted}\n\nPAYMENT TERMS\n${paymentTerms}\n\nVALIDITY\n${validityDays} calendar days from approval of this draft.\n\nNEXT STEP\nValidate scope, responsibilities and start date in a short alignment meeting.\n\nVictor Hugo Simon`;
  }
  return `PROPOSTA COMERCIAL — ${definition.name}\n\nCliente: ${company}\nContato: ${opportunity.contact_name}\n\nOBJETIVO\nEstruturar um caminho claro e executável do desafio atual até uma entrega mensurável, conectando gestão, produto, tecnologia e dados conforme o escopo.\n\nESCOPO\n${scopeLines}\n\nINVESTIMENTO\n${formatted}\n\nCONDIÇÕES DE PAGAMENTO\n${paymentTerms}\n\nVALIDADE\n${validityDays} dias corridos a partir da aprovação deste rascunho.\n\nPRÓXIMO PASSO\nValidar escopo, responsabilidades e data de início em uma reunião curta de alinhamento.\n\nVictor Hugo Simon`;
}

async function createProposal(request, env, opportunityId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 30_000);
  const opportunity = await getOpportunity(env, opportunityId);
  if (!opportunity) return json({ error: 'not_found' }, { status: 404 });
  if (opportunity.status === 'lost') return json({ error: 'opportunity_closed_lost' }, { status: 409 });

  const definition = OFFERS[opportunity.offer_key] || OFFERS['solucao-personalizada'];
  const value = body.value === undefined ? Number(opportunity.estimated_value || 0) : moneyValue(body.value);
  if (value <= 0) return json({ error: 'proposal_value_required' }, { status: 422 });
  const paymentTerms = clean(body.paymentTerms || definition.payment, 500);
  const validityDays = Math.max(1, Math.min(90, Math.round(Number(body.validityDays || 15))));
  const previous = await env.DB.prepare('SELECT COALESCE(MAX(version),0) version FROM crm_proposals WHERE opportunity_id=?').bind(opportunityId).first();
  const version = Number(previous?.version || 0) + 1;
  const title = clean(body.title || `${definition.name} — ${opportunity.account_name || opportunity.contact_name}`, 240);
  const content = proposalText(opportunity, definition, value, paymentTerms, validityDays);
  const proposalId = id('proposal');

  const statements = [
    env.DB.prepare(`INSERT INTO crm_proposals (id,opportunity_id,version,title,scope_json,value,payment_terms,validity_days,content,status,approval_required,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,'draft',1,?)`)
      .bind(proposalId, opportunityId, version, title, JSON.stringify(definition.scope), value, paymentTerms, validityDays, content, JSON.stringify({ offerKey: opportunity.offer_key, requiresHumanApproval: true })),
    env.DB.prepare(`UPDATE crm_opportunities SET stage='proposal',probability=CASE WHEN probability<60 THEN 60 ELSE probability END,next_action='Revisar e aprovar proposta comercial',next_action_due_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(isoAfterDays(1), opportunityId)
  ];
  if (opportunity.stage !== 'proposal') {
    statements.push(env.DB.prepare(`INSERT INTO crm_opportunity_history (id,opportunity_id,from_stage,to_stage,note,metadata_json) VALUES (?,?,?,?,?,?)`)
      .bind(id('opp_history'), opportunityId, opportunity.stage, 'proposal', 'Rascunho de proposta comercial criado', JSON.stringify({ proposalId, value, version })));
  }
  await env.DB.batch(statements);
  return json({ id: proposalId, opportunityId, version, title, value, content, status: 'draft', requiresHumanApproval: true }, { status: 201 });
}

async function listProposals(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare(`
    SELECT p.*, o.stage opportunity_stage, o.status opportunity_status,
      c.name contact_name, a.name account_name
    FROM crm_proposals p
    JOIN crm_opportunities o ON o.id=p.opportunity_id
    JOIN crm_contacts c ON c.id=o.contact_id
    LEFT JOIN crm_accounts a ON a.id=o.account_id
    ORDER BY CASE p.status WHEN 'draft' THEN 1 WHEN 'approved' THEN 2 WHEN 'shared' THEN 3 ELSE 4 END, p.updated_at DESC
    LIMIT 200
  `).all();
  return json({ proposals: result.results.map((row) => ({ ...row, scope: parseMetadata(row.scope_json), metadata: parseMetadata(row.metadata_json), requiresHumanApproval: true })) });
}

async function updateProposal(request, env, proposalId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 10_000);
  const proposal = await env.DB.prepare('SELECT * FROM crm_proposals WHERE id=?').bind(proposalId).first();
  if (!proposal) return json({ error: 'not_found' }, { status: 404 });
  const status = clean(body.status, 30);
  if (!['draft', 'approved', 'shared', 'accepted', 'rejected'].includes(status)) return json({ error: 'invalid_status' }, { status: 422 });

  const statements = [];
  if (status === 'approved') {
    statements.push(env.DB.prepare("UPDATE crm_proposals SET status='approved',approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(proposalId));
  } else if (status === 'shared') {
    if (!proposal.approved_at && proposal.status !== 'approved') return json({ error: 'approval_required_before_share' }, { status: 409 });
    statements.push(env.DB.prepare("UPDATE crm_proposals SET status='shared',shared_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(proposalId));
    statements.push(env.DB.prepare("UPDATE crm_opportunities SET stage='negotiation',probability=CASE WHEN probability<75 THEN 75 ELSE probability END,next_action='Acompanhar retorno da proposta',next_action_due_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(isoAfterDays(3), proposal.opportunity_id));
  } else if (status === 'accepted') {
    statements.push(env.DB.prepare("UPDATE crm_proposals SET status='accepted',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(proposalId));
    statements.push(env.DB.prepare("UPDATE crm_opportunities SET stage='won',status='won',probability=100,next_action='Iniciar handoff para execução',next_action_due_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(isoAfterDays(1), proposal.opportunity_id));
  } else if (status === 'rejected') {
    statements.push(env.DB.prepare("UPDATE crm_proposals SET status='rejected',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(proposalId));
  } else {
    statements.push(env.DB.prepare("UPDATE crm_proposals SET status='draft',approved_at=NULL,shared_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(proposalId));
  }
  await env.DB.batch(statements);
  return json({ id: proposalId, status, externallySent: false, requiresHumanApproval: true });
}

async function createFollowups(request, env, opportunityId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 10_000);
  const opportunity = await getOpportunity(env, opportunityId);
  if (!opportunity) return json({ error: 'not_found' }, { status: 404 });
  if (['won', 'lost'].includes(opportunity.status)) return json({ error: 'opportunity_closed' }, { status: 409 });
  const existing = await env.DB.prepare('SELECT COUNT(*) total FROM crm_followups WHERE opportunity_id=?').bind(opportunityId).first();
  if (Number(existing?.total || 0) > 0) return json({ existing: true, total: Number(existing.total), requiresHumanApproval: true });

  const channel = ['whatsapp', 'linkedin', 'email'].includes(body.channel) ? body.channel : (opportunity.phone ? 'whatsapp' : opportunity.linkedin_url ? 'linkedin' : 'email');
  const cadence = [
    [1, 2, 'Confirmar recebimento e disponibilidade para conversar'],
    [2, 5, 'Retomar com valor prático, case ou ponto do diagnóstico'],
    [3, 10, 'Encerrar a cadência com porta aberta e próximo passo claro']
  ];
  const statements = [];
  const followups = [];
  for (const [sequence, days, objective] of cadence) {
    const followupId = id('followup');
    const dueAt = isoAfterDays(days);
    followups.push({ id: followupId, sequence, dueAt, channel, objective });
    statements.push(env.DB.prepare(`INSERT INTO crm_followups (id,opportunity_id,contact_id,sequence_no,channel,objective,due_at,status,approval_required,metadata_json) VALUES (?,?,?,?,?,?,?,'planned',1,?)`)
      .bind(followupId, opportunityId, opportunity.contact_id, sequence, channel, objective, dueAt, JSON.stringify({ outboundBlocked: true })));
    statements.push(env.DB.prepare(`INSERT INTO crm_tasks (id,account_id,contact_id,task_type,title,status,priority,approval_required,due_at,metadata_json) VALUES (?,?,?,'sales_followup',?,'open',80,1,?,?)`)
      .bind(id('task'), opportunity.account_id || null, opportunity.contact_id, `Follow-up ${sequence}: ${opportunity.account_name || opportunity.contact_name}`, dueAt, JSON.stringify({ opportunityId, followupId, channel, objective })));
  }
  await env.DB.batch(statements);
  return json({ opportunityId, followups, requiresHumanApproval: true, outboundSent: false }, { status: 201 });
}

async function listFollowups(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare(`
    SELECT f.*, c.name contact_name, a.name account_name, o.stage opportunity_stage
    FROM crm_followups f
    JOIN crm_opportunities o ON o.id=f.opportunity_id
    JOIN crm_contacts c ON c.id=f.contact_id
    LEFT JOIN crm_accounts a ON a.id=o.account_id
    ORDER BY CASE f.status WHEN 'planned' THEN 1 ELSE 2 END, f.due_at ASC
    LIMIT 300
  `).all();
  return json({ followups: result.results.map((row) => ({ ...row, metadata: parseMetadata(row.metadata_json), requiresHumanApproval: true })) });
}

async function updateFollowup(request, env, followupId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 8_000);
  const status = clean(body.status, 20);
  if (!['planned', 'completed', 'skipped'].includes(status)) return json({ error: 'invalid_status' }, { status: 422 });
  const followup = await env.DB.prepare('SELECT * FROM crm_followups WHERE id=?').bind(followupId).first();
  if (!followup) return json({ error: 'not_found' }, { status: 404 });
  if (status === 'completed') {
    await env.DB.prepare("UPDATE crm_followups SET status='completed',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(followupId).run();
  } else if (status === 'skipped') {
    await env.DB.prepare("UPDATE crm_followups SET status='skipped',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(followupId).run();
  } else {
    await env.DB.prepare("UPDATE crm_followups SET status='planned',completed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(followupId).run();
  }
  return json({ id: followupId, status, outboundSent: false, requiresHumanApproval: true });
}

async function opportunityHistory(request, env, opportunityId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare('SELECT * FROM crm_opportunity_history WHERE opportunity_id=? ORDER BY created_at DESC LIMIT 100').bind(opportunityId).all();
  return json({ history: result.results.map((row) => ({ ...row, metadata: parseMetadata(row.metadata_json) })) });
}

export async function handleSalesClosingRoute(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/sales')) return null;
  if (request.method === 'GET' && path === '/api/sales/proposals') return listProposals(request, env);
  if (request.method === 'GET' && path === '/api/sales/followups') return listFollowups(request, env);

  const opportunityMatch = path.match(/^\/api\/sales\/opportunities\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'PATCH' && opportunityMatch) return updateOpportunity(request, env, opportunityMatch[1]);
  const historyMatch = path.match(/^\/api\/sales\/opportunities\/([a-zA-Z0-9_-]+)\/history$/);
  if (request.method === 'GET' && historyMatch) return opportunityHistory(request, env, historyMatch[1]);
  const proposalCreateMatch = path.match(/^\/api\/sales\/opportunities\/([a-zA-Z0-9_-]+)\/proposals$/);
  if (request.method === 'POST' && proposalCreateMatch) return createProposal(request, env, proposalCreateMatch[1]);
  const followupCreateMatch = path.match(/^\/api\/sales\/opportunities\/([a-zA-Z0-9_-]+)\/followups$/);
  if (request.method === 'POST' && followupCreateMatch) return createFollowups(request, env, followupCreateMatch[1]);
  const proposalMatch = path.match(/^\/api\/sales\/proposals\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'PATCH' && proposalMatch) return updateProposal(request, env, proposalMatch[1]);
  const followupMatch = path.match(/^\/api\/sales\/followups\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'PATCH' && followupMatch) return updateFollowup(request, env, followupMatch[1]);
  return json({ error: 'not_found' }, { status: 404 });
}