import { bearerToken, id, json, normalizeText, verifyToken } from './lib.mjs';

function clean(value, max = 900) { return normalizeText(value, max); }
function parseMetadata(value) { try { return JSON.parse(value || '{}'); } catch { return {}; } }
function clamp(value) { return Math.max(0, Math.min(100, Math.round(Number(value || 0)))); }
function digits(value) { return String(value || '').replace(/\D/g, '').slice(0, 20); }
function compactResult(result = {}) {
  const keys = ['id', 'status', 'stage', 'score', 'draftId', 'contactId', 'opportunityId', 'proposalId', 'followupId'];
  return keys.reduce((acc, key) => {
    if (result?.[key] !== undefined && result?.[key] !== null && result?.[key] !== '') acc[key] = result[key];
    return acc;
  }, {});
}

async function requireAdmin(request, env) {
  return (await verifyToken(bearerToken(request), env.AUTH_SECRET)) ? null : json({ error: 'unauthorized' }, { status: 401 });
}

function isRobot(request, env) {
  const key = request.headers.get('X-Robot-Key') || String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return Boolean(env.ROBOT_KEY && key === env.ROBOT_KEY);
}

export function whatsappConfiguration(env) {
  const configured = Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_OWNER_NUMBER && env.WHATSAPP_TEMPLATE_NAME);
  return {
    configured,
    provider: 'meta_whatsapp_cloud_api',
    template: configured ? String(env.WHATSAPP_TEMPLATE_NAME) : null,
    language: String(env.WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR'),
    recipientConfigured: Boolean(env.WHATSAPP_OWNER_NUMBER)
  };
}

async function insertNotification(env, event) {
  const notificationId = id('notify');
  const dedupeKey = clean(event.dedupeKey || `${event.eventType}:${event.entityType || 'system'}:${event.entityId || notificationId}`, 320);
  await env.DB.prepare(`
    INSERT OR IGNORE INTO crm_owner_notifications (
      id,event_type,severity,title,message,entity_type,entity_id,dedupe_key,channel,status,metadata_json
    ) VALUES (?,?,?,?,?,?,?,?,?,'queued',?)
  `).bind(
    notificationId,
    clean(event.eventType || 'growth_event', 80),
    clean(event.severity || 'info', 30),
    clean(event.title || 'Growth OS', 180),
    clean(event.message || 'Nova atividade registrada no Growth OS.', 1200),
    clean(event.entityType, 60) || null,
    clean(event.entityId, 140) || null,
    dedupeKey,
    'whatsapp',
    JSON.stringify(event.metadata || {})
  ).run();
  return env.DB.prepare('SELECT * FROM crm_owner_notifications WHERE dedupe_key=? LIMIT 1').bind(dedupeKey).first();
}

async function sendWhatsappTemplate(env, notification) {
  const config = whatsappConfiguration(env);
  if (!config.configured) return { sent: false, configured: false, reason: 'whatsapp_not_configured' };
  const phoneId = clean(env.WHATSAPP_PHONE_NUMBER_ID, 80);
  const recipient = digits(env.WHATSAPP_OWNER_NUMBER);
  const version = clean(env.META_API_VERSION || 'v26.0', 20);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('whatsapp_timeout'), 12_000);
  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: String(env.WHATSAPP_TEMPLATE_NAME),
          language: { code: String(env.WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR') },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: clean(notification.title, 180) },
              { type: 'text', text: clean(notification.message, 900) }
            ]
          }]
        }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = clean(data?.error?.message || `whatsapp_http_${response.status}`, 700);
      throw new Error(detail);
    }
    return { sent: true, configured: true, providerMessageId: clean(data?.messages?.[0]?.id, 240) || null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function deliverOwnerNotification(env, notificationId) {
  const notification = await env.DB.prepare(`SELECT * FROM crm_owner_notifications WHERE id=? AND status IN ('queued','retry') LIMIT 1`).bind(notificationId).first();
  if (!notification) return { delivered: false, reason: 'not_pending' };
  const config = whatsappConfiguration(env);
  if (!config.configured) return { delivered: false, configured: false, reason: 'whatsapp_not_configured' };
  try {
    const result = await sendWhatsappTemplate(env, notification);
    await env.DB.prepare(`UPDATE crm_owner_notifications SET status='sent',provider_attempts=provider_attempts+1,provider_message_id=?,error_message=NULL,sent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(result.providerMessageId || null, notification.id).run();
    return { delivered: true, providerMessageId: result.providerMessageId || null };
  } catch (error) {
    const attempts = Number(notification.provider_attempts || 0) + 1;
    const terminal = attempts >= 5;
    await env.DB.prepare(`UPDATE crm_owner_notifications SET status=?,provider_attempts=?,error_message=?,next_attempt_at=CASE WHEN ?=1 THEN next_attempt_at ELSE datetime('now','+15 minutes') END,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(terminal ? 'failed' : 'retry', attempts, clean(error?.message || 'whatsapp_send_error', 700), terminal ? 1 : 0, notification.id).run();
    return { delivered: false, configured: true, terminal, error: clean(error?.message || 'whatsapp_send_error', 300) };
  }
}

export async function queueOwnerNotification(env, event, options = {}) {
  const notification = await insertNotification(env, event);
  if (!notification) return { queued: false };
  if (notification.status === 'sent') return { queued: false, duplicate: true, sent: true, id: notification.id };
  const shouldDispatch = options.dispatch !== false;
  const delivery = shouldDispatch ? await deliverOwnerNotification(env, notification.id) : { delivered: false, deferred: true };
  return { queued: true, id: notification.id, ...delivery };
}

export async function processOwnerNotifications(env, limit = 20) {
  const max = Math.max(1, Math.min(50, Number(limit || 20)));
  if (!whatsappConfiguration(env).configured) return { processed: 0, configured: false, pending: true };
  const rows = await env.DB.prepare(`SELECT id FROM crm_owner_notifications WHERE status IN ('queued','retry') AND next_attempt_at<=CURRENT_TIMESTAMP ORDER BY created_at ASC LIMIT ?`).bind(max).all();
  const results = [];
  for (const row of rows.results) results.push({ id: row.id, ...(await deliverOwnerNotification(env, row.id)) });
  return { processed: results.length, configured: true, results };
}

async function actionQueue(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare(`
    SELECT c.id,c.name,c.email,c.phone,c.linkedin_url,c.role,c.status,c.source,c.consent_status,
      a.id account_id,a.name account_name,a.offer_key,a.icp_score,
      s.total score,s.intent,s.engagement,s.authority,s.timing,s.created_at scored_at,
      COALESCE((SELECT MAX(signal_score) FROM crm_signals WHERE account_id=a.id),0) strongest_signal,
      (SELECT description FROM crm_signals WHERE account_id=a.id ORDER BY signal_score DESC,observed_at DESC LIMIT 1) signal_description,
      (SELECT evidence_url FROM crm_signals WHERE account_id=a.id ORDER BY signal_score DESC,observed_at DESC LIMIT 1) evidence_url,
      (SELECT id FROM crm_message_drafts WHERE contact_id=c.id AND status IN ('draft','approved') ORDER BY created_at DESC LIMIT 1) draft_id,
      (SELECT status FROM crm_message_drafts WHERE contact_id=c.id AND status IN ('draft','approved') ORDER BY created_at DESC LIMIT 1) draft_status,
      (SELECT id FROM crm_opportunities WHERE contact_id=c.id AND status='open' ORDER BY created_at DESC LIMIT 1) opportunity_id,
      (SELECT stage FROM crm_opportunities WHERE contact_id=c.id AND status='open' ORDER BY created_at DESC LIMIT 1) opportunity_stage
    FROM crm_contacts c
    JOIN crm_accounts a ON a.id=c.account_id
    JOIN crm_scores s ON s.id=(SELECT id FROM crm_scores WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 1)
    WHERE s.total>=65 AND c.consent_status!='denied'
    ORDER BY s.total DESC,s.intent DESC,s.authority DESC,s.created_at DESC
    LIMIT 120
  `).all();
  const rows = result.results.map((row) => {
    const score = clamp(row.score);
    const channelReady = Boolean(row.email || row.linkedin_url);
    const priority = clamp(score
      + (row.source === 'verified_public_source' ? 6 : 0)
      + (channelReady ? 4 : 0)
      + (Number(row.intent || 0) >= 85 ? 4 : 0)
      + (Number(row.authority || 0) >= 90 ? 3 : 0)
      + (Number(row.timing || 0) >= 80 ? 3 : 0)
      + (Number(row.engagement || 0) >= 35 ? 5 : 0));
    let nextAction = 'Revisar evidências e preparar abordagem';
    if (row.opportunity_id) nextAction = `Avançar oportunidade (${row.opportunity_stage || 'aberta'})`;
    else if (row.draft_status === 'approved') nextAction = 'Fazer contato humano com a abordagem aprovada';
    else if (row.draft_id) nextAction = 'Revisar e aprovar a abordagem preparada';
    else if (!channelReady) nextAction = 'Identificar canal público do decisor';
    return {
      ...row,
      priorityScore: priority,
      channelReady,
      qualification: row.status === 'hot_lead' || score >= 80 ? 'hot' : priority >= 80 ? 'priority' : 'qualified',
      nextAction
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore || Number(b.score) - Number(a.score));
  return json({ contacts: rows.slice(0, 50), threshold: 65, hotThreshold: 80, model: 'priority_v3' });
}

async function telemetry(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const [accounts, contacts, qualified, hot, drafts, opportunities, tasks, jobs, notifications] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) total FROM crm_accounts'),
    env.DB.prepare('SELECT COUNT(*) total FROM crm_contacts'),
    env.DB.prepare("SELECT COUNT(*) total FROM crm_contacts c JOIN crm_scores s ON s.id=(SELECT id FROM crm_scores WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 1) WHERE s.total>=65 AND c.consent_status!='denied'"),
    env.DB.prepare("SELECT COUNT(*) total FROM crm_contacts c JOIN crm_scores s ON s.id=(SELECT id FROM crm_scores WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 1) WHERE s.total>=80 AND c.consent_status!='denied'"),
    env.DB.prepare("SELECT COUNT(*) total FROM crm_message_drafts WHERE status='draft'"),
    env.DB.prepare("SELECT COUNT(*) total,COALESCE(SUM(estimated_value),0) value FROM crm_opportunities WHERE status='open'"),
    env.DB.prepare("SELECT COUNT(*) total FROM crm_tasks WHERE status='open'"),
    env.DB.prepare("SELECT status,COUNT(*) total FROM crm_agent_jobs GROUP BY status"),
    env.DB.prepare("SELECT status,COUNT(*) total FROM crm_owner_notifications GROUP BY status")
  ]);
  return json({
    accounts: Number(accounts.results?.[0]?.total || 0),
    contacts: Number(contacts.results?.[0]?.total || 0),
    qualified: Number(qualified.results?.[0]?.total || 0),
    hot: Number(hot.results?.[0]?.total || 0),
    draftsPending: Number(drafts.results?.[0]?.total || 0),
    opportunities: Number(opportunities.results?.[0]?.total || 0),
    pipelineValue: Number(opportunities.results?.[0]?.value || 0),
    openTasks: Number(tasks.results?.[0]?.total || 0),
    jobs: jobs.results || [],
    notifications: notifications.results || [],
    whatsapp: whatsappConfiguration(env)
  });
}

async function notificationHistory(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const rows = await env.DB.prepare(`SELECT id,event_type,severity,title,message,entity_type,entity_id,status,provider_attempts,error_message,created_at,sent_at FROM crm_owner_notifications ORDER BY created_at DESC LIMIT 100`).all();
  return json({ notifications: rows.results, whatsapp: whatsappConfiguration(env) });
}

export async function notifyInboundLead(env, payload, result = {}) {
  const name = clean(payload?.name || 'Novo lead', 160);
  const company = clean(payload?.company || 'empresa não informada', 160);
  const score = Number(result?.score || 0);
  return queueOwnerNotification(env, {
    eventType: 'lead_created',
    severity: score >= 70 ? 'high' : 'info',
    title: 'Novo lead no perfil profissional',
    message: `${name} · ${company}. Score ${score}. Estágio ${clean(result?.stage || 'novo', 60)}. O Growth OS já registrou e qualificou a entrada.`,
    entityType: 'lead',
    entityId: result?.id,
    dedupeKey: `lead-created:${result?.id}`,
    metadata: { score, stage: result?.stage, source: payload?.source || 'website' }
  });
}

function panelActionTitle(path, method) {
  if (/\/handoff$/.test(path)) return 'Oportunidade comercial criada';
  if (/\/draft$/.test(path) && method === 'POST') return 'Abordagem comercial preparada';
  if (/\/drafts\//.test(path)) return 'Abordagem comercial atualizada';
  if (/\/proposals$/.test(path) && method === 'POST') return 'Proposta comercial criada';
  if (/\/proposals\//.test(path)) return 'Proposta comercial atualizada';
  if (/\/followups$/.test(path) && method === 'POST') return 'Cadência de follow-up criada';
  if (/\/followups\//.test(path)) return 'Follow-up atualizado';
  if (/\/opportunities\//.test(path)) return 'Oportunidade comercial atualizada';
  if (/\/content|\/growth/.test(path)) return 'Ação de crescimento executada';
  return 'Ação registrada no Growth OS';
}

export async function notifyPanelMutation(env, path, method, result = {}) {
  const title = panelActionTitle(path, method);
  const compact = compactResult(result);
  const descriptor = Object.entries(compact).map(([key, value]) => `${key}: ${value}`).join(' · ');
  return queueOwnerNotification(env, {
    eventType: 'panel_action',
    severity: /accepted|won|handoff|proposal/.test(`${path} ${JSON.stringify(result)}`) ? 'high' : 'info',
    title,
    message: `${method} ${path}${descriptor ? ` · ${descriptor}` : ''}.`,
    entityType: 'panel_action',
    entityId: clean(result?.id || result?.draftId || result?.contactId || result?.status, 140) || null,
    dedupeKey: `panel:${method}:${path}:${clean(result?.id || result?.draftId || result?.contactId || result?.status, 140)}:${Date.now()}`,
    metadata: compact
  });
}

export async function notifyProspectingResponse(env, path, responsePayload = {}) {
  const events = [];
  if (path === '/api/prospecting-maintenance/run') {
    const created = Number(responsePayload?.scout?.created || 0);
    if (created > 0) {
      const names = (responsePayload?.scout?.findings || []).map((item) => item.name).filter(Boolean).slice(0, 8);
      events.push(queueOwnerNotification(env, {
        eventType: 'market_scout_batch',
        title: 'Novos prospects encontrados',
        message: `${created} novas empresas foram adicionadas ao radar${names.length ? `: ${names.join(', ')}` : ''}. Agora entram em pesquisa e qualificação.`,
        entityType: 'prospecting_batch',
        entityId: new Date().toISOString().slice(0, 13),
        dedupeKey: `scout:${new Date().toISOString().slice(0, 13)}:${names.join('|')}`
      }));
    }
  }
  if (path === '/api/prospecting-verified-contacts/run') {
    for (const item of responsePayload?.imported || []) {
      events.push(queueOwnerNotification(env, {
        eventType: 'decision_maker_verified',
        severity: 'high',
        title: 'Decisor público verificado',
        message: `${clean(item.name, 160)} · ${clean(item.role, 180)} · ${clean(item.company, 180)}. ${item.hasLinkedIn ? 'LinkedIn público disponível.' : 'Canal direto ainda precisa ser localizado.'}`,
        entityType: 'contact',
        entityId: item.contactId,
        dedupeKey: `verified-contact:${item.contactId}`,
        metadata: item
      }));
    }
  }
  if (path === '/api/prospecting-automation/run') {
    const accountIds = new Set();
    for (const item of responsePayload?.results || []) {
      if (item?.agent === 'qualifier' && item?.status === 'completed' && Number(item?.output?.qualified || 0) > 0 && item?.output?.accountId) accountIds.add(item.output.accountId);
      if (item?.agent === 'personalizer' && item?.status === 'completed' && item?.output?.draftId) {
        const contact = await env.DB.prepare(`SELECT c.name,c.role,a.name account_name FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id=c.account_id WHERE c.id=?`).bind(item.output.contactId).first();
        events.push(queueOwnerNotification(env, {
          eventType: 'outreach_draft_created',
          severity: 'high',
          title: 'Abordagem pronta para sua aprovação',
          message: `${clean(contact?.name || 'Contato', 160)} · ${clean(contact?.account_name || 'empresa', 180)}. Canal ${clean(item.output.channel, 40)}, score ${Number(item.output.score || 0)}. Nenhuma mensagem foi enviada ao prospect.`,
          entityType: 'draft',
          entityId: item.output.draftId,
          dedupeKey: `draft-created:${item.output.draftId}`
        }));
      }
    }
    for (const accountId of accountIds) {
      const qualifiedRows = await env.DB.prepare(`
        SELECT c.id,c.name,c.role,c.status,a.name account_name,s.total score,s.intent,s.authority
        FROM crm_contacts c JOIN crm_accounts a ON a.id=c.account_id
        JOIN crm_scores s ON s.id=(SELECT id FROM crm_scores WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 1)
        WHERE c.account_id=? AND s.total>=65 AND c.consent_status!='denied'
        ORDER BY s.total DESC LIMIT 20
      `).bind(accountId).all();
      for (const contact of qualifiedRows.results) {
        const score = Number(contact.score || 0);
        events.push(queueOwnerNotification(env, {
          eventType: score >= 80 ? 'lead_hot' : 'lead_qualified',
          severity: score >= 80 ? 'critical' : 'high',
          title: score >= 80 ? 'Lead quente identificado' : 'Lead qualificado identificado',
          message: `${clean(contact.name, 160)} · ${clean(contact.role || 'cargo não informado', 180)} · ${clean(contact.account_name, 180)}. Score ${score}, intenção ${Number(contact.intent || 0)}, autoridade ${Number(contact.authority || 0)}.`,
          entityType: 'contact',
          entityId: contact.id,
          dedupeKey: `qualified:${contact.id}:${score}`,
          metadata: { score, intent: contact.intent, authority: contact.authority, status: contact.status }
        }));
      }
    }
  }
  if (events.length) await Promise.allSettled(events);
  return { notificationsQueued: events.length };
}

export async function handleGrowthV3Route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/api/notifications/run') {
    if (!isRobot(request, env)) return json({ error: 'unauthorized' }, { status: 401 });
    if (request.method === 'POST') return json(await processOwnerNotifications(env, Number(url.searchParams.get('limit') || 20)));
    return json({ error: 'not_found' }, { status: 404 });
  }
  if (!path.startsWith('/api/growth-v3')) return null;
  if (request.method === 'GET' && path === '/api/growth-v3/action-queue') return actionQueue(request, env);
  if (request.method === 'GET' && path === '/api/growth-v3/telemetry') return telemetry(request, env);
  if (request.method === 'GET' && path === '/api/growth-v3/notifications') return notificationHistory(request, env);
  return json({ error: 'not_found' }, { status: 404 });
}
