import { id, json, normalizeText } from './lib.mjs';

const SUPPORTED_AGENTS = new Set(['researcher', 'qualifier', 'personalizer']);
const OFFER_KEYS = new Set(['diagnostico-executivo', 'sprint-produto-delivery', 'automacao-dados-ia', 'solucao-personalizada']);

function clean(value, max = 500) { return normalizeText(value, max); }
function clamp(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
}
function parseJson(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }
function norm(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
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

async function fetchPublicPage(urlValue) {
  let current = safePublicUrl(urlValue);
  if (!current) throw new Error('invalid_public_source');
  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetch(current.toString(), {
      redirect: 'manual',
      headers: { 'User-Agent': 'VictorHugoGrowthOS/1.1 (+public business research)' }
    });
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
    const raw = (await response.text()).slice(0, 140_000);
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 38_000);
    if (text.length < 80) throw new Error('source_text_too_short');
    return { url: current.toString(), raw, text };
  }
  throw new Error('too_many_redirects');
}

function extractEmails(raw) {
  const matches = String(raw || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map((value) => value.toLowerCase()))]
    .filter((email) => !/\.(?:png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(email))
    .slice(0, 20);
}
function usefulEmail(email) {
  return Boolean(email) && !/(?:no-?reply|noreply|privacidade|privacy|dpo|lgpd|carreira|career|recrut|rh@|jobs?@)/i.test(email);
}
function extractPhones(text) {
  const matches = String(text || '').match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}/g) || [];
  return [...new Set(matches.map((value) => clean(value, 40)).filter((value) => value.replace(/\D/g, '').length >= 10))].slice(0, 8);
}
function containsEvidence(sourceText, value) {
  const needle = norm(value);
  return needle.length >= 3 && norm(sourceText).includes(needle);
}
function safeOffer(value, fallback = 'diagnostico-executivo') {
  return OFFER_KEYS.has(value) ? value : fallback;
}

async function runResearcher(env, job, input) {
  const account = await env.DB.prepare('SELECT * FROM crm_accounts WHERE id=?').bind(clean(input.accountId, 100)).first();
  if (!account) throw new Error('account_not_found');
  if (!account.website) throw new Error('account_website_missing');

  const primary = await fetchPublicPage(account.website);
  let source = primary;
  const sourceUrl = clean(input.sourceUrl, 1200);
  if (sourceUrl && safePublicUrl(sourceUrl) && safePublicUrl(sourceUrl)?.hostname !== safePublicUrl(account.website)?.hostname) {
    try {
      const secondary = await fetchPublicPage(sourceUrl);
      source = { url: `${primary.url} | ${secondary.url}`, raw: `${primary.raw}\n${secondary.raw}`, text: `${primary.text}\n\nFONTE COMPLEMENTAR:\n${secondary.text}`.slice(0, 70_000) };
    } catch (error) {
      console.error('prospecting_secondary_source_error', { accountId: account.id, message: error?.message });
    }
  }

  const emails = extractEmails(source.raw);
  const phones = extractPhones(source.text);
  const existingMeta = parseJson(account.metadata_json, {});
  let research = {
    summary: source.text.slice(0, 1200),
    industry: account.industry || '',
    region: account.region || '',
    recommendedIcpScore: clamp(account.icp_score, 60),
    recommendedOfferKey: safeOffer(account.offer_key || 'diagnostico-executivo'),
    signals: [{ type: 'public_research', description: 'Site oficial pesquisado e evidências públicas registradas.', score: Math.max(45, clamp(account.icp_score, 60) - 15) }],
    people: [],
    pains: []
  };

  if (env.AI?.run) {
    const prompt = `Você é o Researcher de uma máquina comercial B2B de consultoria em Produto, Projetos, PMO, Delivery, Dados, Automação e IA.\nAnalise SOMENTE o material público abaixo. Não invente pessoas, cargos, projetos, números, e-mails ou dores.\nEmpresa: ${account.name}\nOferta atual: ${account.offer_key || 'não definida'}\nFonte(s): ${source.url}\nConteúdo público:\n${source.text}\n\nRetorne SOMENTE JSON válido com: summary (até 1400 caracteres), industry, region, recommendedIcpScore (0-100), recommendedOfferKey (diagnostico-executivo | sprint-produto-delivery | automacao-dados-ia | solucao-personalizada), pains (array até 5), signals (array até 6 com type, description, score 0-100), people (array até 6 com name, role, email opcional). Em people, inclua apenas pessoas cujo nome E cargo aparecem literalmente no material fornecido. Em signals, priorize expansão, transformação digital, integração, automação, IA, dados, ERP, governança, eficiência operacional, inovação, novos produtos ou grandes projetos.`;
    const ai = extractJson(extractText(await env.AI.run('@cf/zai-org/glm-4.7-flash', { prompt, max_tokens: 2400 })));
    if (ai?.summary) research = { ...research, ...ai };
  }

  const currentIcp = clamp(account.icp_score, 0);
  const researchedIcp = clamp(research.recommendedIcpScore, currentIcp || 60);
  const finalIcp = Math.max(currentIcp, researchedIcp);
  const offerKey = safeOffer(research.recommendedOfferKey, safeOffer(account.offer_key || 'diagnostico-executivo'));
  const validSignals = (Array.isArray(research.signals) ? research.signals : []).slice(0, 6)
    .map((signal) => ({
      type: clean(signal?.type || 'public_signal', 80),
      description: clean(signal?.description, 900),
      score: clamp(signal?.score, 50)
    }))
    .filter((signal) => signal.description.length >= 12);
  if (!validSignals.length) validSignals.push({ type: 'public_research', description: 'Empresa pesquisada por fontes públicas oficiais.', score: Math.max(45, finalIcp - 15) });

  const sourceText = source.text;
  const validPeople = (Array.isArray(research.people) ? research.people : []).slice(0, 6)
    .map((person) => ({ name: clean(person?.name, 180), role: clean(person?.role, 180), email: clean(person?.email, 240).toLowerCase() }))
    .filter((person) => person.name.split(/\s+/).length >= 2 && person.role.length >= 3)
    .filter((person) => containsEvidence(sourceText, person.name) && containsEvidence(sourceText, person.role))
    .map((person) => ({ ...person, email: person.email && emails.includes(person.email) ? person.email : '' }));

  const statements = [
    env.DB.prepare(`UPDATE crm_accounts SET industry=CASE WHEN COALESCE(industry,'')='' THEN ? ELSE industry END, region=CASE WHEN COALESCE(region,'')='' THEN ? ELSE region END, offer_key=?, icp_score=?, status='researched', metadata_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(clean(research.industry || account.industry, 120), clean(research.region || account.region, 120), offerKey, finalIcp, JSON.stringify({
        ...existingMeta,
        lastPublicResearch: {
          at: new Date().toISOString(),
          source: source.url,
          summary: clean(research.summary, 1800),
          pains: Array.isArray(research.pains) ? research.pains.slice(0, 5).map((item) => clean(item, 400)) : [],
          emails: emails.filter(usefulEmail).slice(0, 5),
          phones,
          policy: 'public_sources_only'
        }
      }), account.id),
    env.DB.prepare("UPDATE crm_tasks SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE account_id=? AND task_type='account_research' AND status='open'").bind(account.id),
    env.DB.prepare("UPDATE crm_campaign_targets SET research_status='completed', updated_at=CURRENT_TIMESTAMP WHERE account_id=?").bind(account.id)
  ];
  for (const signal of validSignals) {
    statements.push(env.DB.prepare(`INSERT INTO crm_signals (id,account_id,signal_type,description,evidence_url,signal_score,metadata_json) VALUES (?,?,?,?,?,?,?)`)
      .bind(id('signal'), account.id, signal.type, signal.description, primary.url, signal.score, JSON.stringify({ jobId: job.id, policy: 'public_sources_only' })));
  }
  await env.DB.batch(statements);

  let contactsCreated = 0;
  for (const person of validPeople) {
    const existing = await env.DB.prepare('SELECT id FROM crm_contacts WHERE account_id=? AND lower(name)=lower(?) LIMIT 1').bind(account.id, person.name).first();
    if (existing) continue;
    await env.DB.prepare(`INSERT INTO crm_contacts (id,account_id,name,email,role,language,status,source,consent_status,metadata_json) VALUES (?,?,?,?,?,'pt','researched','official_website','unknown',?)`)
      .bind(id('contact'), account.id, person.name, person.email, person.role, JSON.stringify({ evidenceUrl: primary.url, researchJobId: job.id, publicSource: true })).run();
    contactsCreated += 1;
  }

  if (!validPeople.length) {
    const publicEmail = emails.find(usefulEmail) || '';
    if (publicEmail) {
      const existing = await env.DB.prepare('SELECT id FROM crm_contacts WHERE account_id=? AND lower(email)=lower(?) LIMIT 1').bind(account.id, publicEmail).first();
      if (!existing) {
        await env.DB.prepare(`INSERT INTO crm_contacts (id,account_id,name,email,role,language,status,source,consent_status,metadata_json) VALUES (?,?,?,?,?,'pt','public_contact','official_website','unknown',?)`)
          .bind(id('contact'), account.id, `Canal institucional - ${account.name}`, publicEmail, 'Contato institucional público', JSON.stringify({ evidenceUrl: primary.url, researchJobId: job.id, publicSource: true, genericContact: true })).run();
        contactsCreated += 1;
      }
    }
  }

  await env.DB.prepare(`INSERT INTO crm_agent_jobs (id,agent_key,status,input_json,scheduled_at) VALUES (?,'qualifier','queued',?,CURRENT_TIMESTAMP)`)
    .bind(id('job'), JSON.stringify({ accountId: account.id, campaignId: clean(input.campaignId, 100), policy: 'public_sources_only' })).run();

  return { accountId: account.id, source: primary.url, icpScore: finalIcp, signals: validSignals.length, contactsCreated, nextAgent: 'qualifier', noOutbound: true };
}

function authorityScore(role) {
  const value = norm(role);
  if (/\b(ceo|cio|cto|coo|cdo|cpo|presidente|vice presidente|vp|diretor|diretora|head)\b/.test(value)) return 90;
  if (/\b(gerente|manager|gestor|product owner|product manager|program manager|pmo|tech lead|líder|lider)\b/.test(value)) return 75;
  if (/\b(coordenador|coordenadora|especialista|supervisor|supervisora)\b/.test(value)) return 60;
  if (/contato institucional/.test(value)) return 30;
  return 45;
}

async function runQualifier(env, job, input) {
  const account = await env.DB.prepare('SELECT * FROM crm_accounts WHERE id=?').bind(clean(input.accountId, 100)).first();
  if (!account) throw new Error('account_not_found');
  const contacts = await env.DB.prepare('SELECT * FROM crm_contacts WHERE account_id=? ORDER BY updated_at DESC LIMIT 40').bind(account.id).all();
  const signals = await env.DB.prepare('SELECT * FROM crm_signals WHERE account_id=? ORDER BY observed_at DESC, signal_score DESC LIMIT 20').bind(account.id).all();
  const intent = signals.results.reduce((max, row) => Math.max(max, clamp(row.signal_score, 0)), 0);
  const newestSignal = signals.results[0]?.observed_at ? new Date(signals.results[0].observed_at).getTime() : 0;
  const daysOld = newestSignal ? Math.max(0, (Date.now() - newestSignal) / 86_400_000) : 999;
  const timing = intent >= 75 && daysOld <= 45 ? 85 : intent >= 60 && daysOld <= 90 ? 70 : 45;
  let highest = 0;
  let hotCount = 0;
  let qualifiedCount = 0;

  for (const contact of contacts.results) {
    const inbound = await env.DB.prepare("SELECT COUNT(*) total FROM crm_activities WHERE contact_id=? AND direction='inbound'").bind(contact.id).first();
    const engagement = Math.min(100, Number(inbound?.total || 0) * 35);
    const values = {
      icpFit: clamp(account.icp_score, 0),
      intent,
      engagement,
      authority: authorityScore(contact.role),
      timing
    };
    const total = Math.round(values.icpFit * 0.30 + values.intent * 0.25 + values.engagement * 0.15 + values.authority * 0.20 + values.timing * 0.10);
    highest = Math.max(highest, total);
    const hot = total >= 80 && contact.consent_status !== 'denied';
    const qualified = total >= 65 && contact.consent_status !== 'denied';
    if (hot) hotCount += 1;
    if (qualified) qualifiedCount += 1;

    await env.DB.prepare('INSERT INTO crm_scores (id,contact_id,icp_fit,intent,engagement,authority,timing,total,explanation_json) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id('score'), contact.id, values.icpFit, values.intent, values.engagement, values.authority, values.timing, total, JSON.stringify({
        agent: 'qualifier', jobId: job.id, accountId: account.id, publicSignals: signals.results.slice(0, 5).map((row) => ({ type: row.signal_type, description: row.description, score: row.signal_score, evidenceUrl: row.evidence_url }))
      })).run();

    if (hot) {
      await env.DB.prepare("UPDATE crm_contacts SET status='hot_lead', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(contact.id).run();
      const existingTask = await env.DB.prepare("SELECT id FROM crm_tasks WHERE contact_id=? AND task_type='human_handoff' AND status='open' LIMIT 1").bind(contact.id).first();
      if (!existingTask) {
        await env.DB.prepare(`INSERT INTO crm_tasks (id,account_id,contact_id,task_type,title,status,priority,approval_required,metadata_json) VALUES (?,?,?,'human_handoff',?,'open',?,1,?)`)
          .bind(id('task'), account.id, contact.id, `Revisar lead quente: ${contact.name} / ${account.name}`, total, JSON.stringify({ score: total, agentJobId: job.id, outboundBlocked: true })).run();
      }
    } else if (qualified) {
      await env.DB.prepare("UPDATE crm_contacts SET status='qualified', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(contact.id).run();
      const existingTask = await env.DB.prepare("SELECT id FROM crm_tasks WHERE contact_id=? AND task_type='prospecting_review' AND status='open' LIMIT 1").bind(contact.id).first();
      if (!existingTask) {
        await env.DB.prepare(`INSERT INTO crm_tasks (id,account_id,contact_id,task_type,title,status,priority,approval_required,metadata_json) VALUES (?,?,?,'prospecting_review',?,'open',?,1,?)`)
          .bind(id('task'), account.id, contact.id, `Revisar alvo qualificado: ${contact.name} / ${account.name}`, total, JSON.stringify({ score: total, agentJobId: job.id, noOutbound: true })).run();
      }
    }

    if (qualified) {
      const pending = await env.DB.prepare("SELECT id FROM crm_agent_jobs WHERE agent_key='personalizer' AND status IN ('queued','running') AND input_json LIKE ? LIMIT 1").bind(`%${contact.id}%`).first();
      if (!pending) {
        await env.DB.prepare(`INSERT INTO crm_agent_jobs (id,agent_key,status,input_json,scheduled_at) VALUES (?,'personalizer','queued',?,CURRENT_TIMESTAMP)`)
          .bind(id('job'), JSON.stringify({ accountId: account.id, contactId: contact.id, score: total, policy: 'human_approval_required' })).run();
      }
    }
  }

  const accountStatus = hotCount ? 'hot_lead' : qualifiedCount ? 'qualified' : 'researched';
  await env.DB.prepare('UPDATE crm_accounts SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(accountStatus, account.id).run();
  if (!contacts.results.length) {
    const existingTask = await env.DB.prepare("SELECT id FROM crm_tasks WHERE account_id=? AND task_type='contact_research' AND status='open' LIMIT 1").bind(account.id).first();
    if (!existingTask) {
      await env.DB.prepare(`INSERT INTO crm_tasks (id,account_id,task_type,title,status,priority,approval_required,metadata_json) VALUES (?,?,'contact_research',?,'open',?,0,?)`)
        .bind(id('task'), account.id, `Identificar decisor público: ${account.name}`, Math.max(60, clamp(account.icp_score, 0)), JSON.stringify({ publicSourcesOnly: true, noOutbound: true })).run();
    }
  }
  return { accountId: account.id, contacts: contacts.results.length, highestScore: highest, qualified: qualifiedCount, hot: hotCount, noOutbound: true };
}

async function runPersonalizer(env, job, input) {
  const contact = await env.DB.prepare(`SELECT c.*,a.name account_name,a.offer_key,a.metadata_json account_metadata,
    COALESCE((SELECT total FROM crm_scores WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 1),0) score
    FROM crm_contacts c JOIN crm_accounts a ON a.id=c.account_id WHERE c.id=?`).bind(clean(input.contactId, 100)).first();
  if (!contact) throw new Error('contact_not_found');
  if (contact.consent_status === 'denied') return { contactId: contact.id, skipped: 'consent_denied', noOutbound: true };
  const score = clamp(contact.score, 0);
  if (score < 65) return { contactId: contact.id, skipped: 'score_below_review_threshold', score, noOutbound: true };
  const existing = await env.DB.prepare("SELECT id FROM crm_message_drafts WHERE contact_id=? AND purpose='prospecting_review' AND status IN ('draft','approved') ORDER BY created_at DESC LIMIT 1").bind(contact.id).first();
  if (existing) return { contactId: contact.id, draftId: existing.id, existing: true, noOutbound: true };

  const accountMeta = parseJson(contact.account_metadata, {});
  const research = accountMeta.lastPublicResearch || {};
  const channel = contact.email ? 'email' : contact.linkedin_url ? 'linkedin' : '';
  if (!channel) return { contactId: contact.id, skipped: 'no_public_contact_channel', noOutbound: true };
  const offerKey = safeOffer(contact.offer_key || 'diagnostico-executivo');
  let subject = channel === 'email' ? `Possível agenda para ${contact.account_name}` : '';
  let body = `Olá, ${clean(contact.name, 180)}. Atuo em projetos de Produto, PMO, Delivery, Dados e Automação. Vi informações públicas da ${clean(contact.account_name, 180)} que indicam um momento relevante para evolução operacional e tecnológica. Se fizer sentido, posso compartilhar uma leitura objetiva de prioridades e próximos passos. Abraço, Victor Hugo Simon.`;

  if (env.AI?.run) {
    const prompt = `Você é o Personalizer de prospecção B2B de Victor Hugo Simon. Prepare UMA mensagem curta, profissional e não invasiva. Não invente fatos. Use apenas as evidências fornecidas. Não diga que houve monitoramento automatizado. Não pressione o destinatário.\nEmpresa: ${contact.account_name}\nContato: ${contact.name}\nCargo: ${contact.role || 'não identificado'}\nCanal: ${channel}\nOferta: ${offerKey}\nScore interno: ${score}\nResumo público: ${clean(research.summary, 1800)}\nPossíveis dores públicas: ${JSON.stringify(Array.isArray(research.pains) ? research.pains.slice(0, 4) : [])}\n\nRetorne SOMENTE JSON com subject e body. body deve ter no máximo 900 caracteres, tom executivo e convite leve para conversa de 20 minutos. Sem promessas de resultado e sem dados inventados.`;
    const ai = extractJson(extractText(await env.AI.run('@cf/zai-org/glm-4.7-flash', { prompt, max_tokens: 900 })));
    if (ai?.body) {
      subject = clean(ai.subject || subject, 180);
      body = clean(ai.body, 1200);
    }
  }

  const draftId = id('draft');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO crm_message_drafts (id,opportunity_id,contact_id,channel,purpose,subject,body,status,approval_required,metadata_json) VALUES (?,NULL,?,?, 'prospecting_review',?,?,'draft',1,?)`)
      .bind(draftId, contact.id, channel, subject, body, JSON.stringify({ agent: 'personalizer', agentJobId: job.id, score, evidenceUrl: research.source || null, outboundSent: false, requiresHumanApproval: true })),
    env.DB.prepare(`INSERT INTO crm_tasks (id,account_id,contact_id,task_type,title,status,priority,approval_required,metadata_json) VALUES (?,?,?,'review_outreach_draft',?,'open',?,1,?)`)
      .bind(id('task'), contact.account_id, contact.id, `Aprovar abordagem: ${contact.name} / ${contact.account_name}`, score, JSON.stringify({ draftId, channel, outboundBlocked: true }))
  ]);
  return { contactId: contact.id, draftId, channel, score, requiresHumanApproval: true, outboundSent: false };
}

async function executeJob(env, job) {
  const input = parseJson(job.input_json, {});
  if (job.agent_key === 'researcher') return runResearcher(env, job, input);
  if (job.agent_key === 'qualifier') return runQualifier(env, job, input);
  if (job.agent_key === 'personalizer') return runPersonalizer(env, job, input);
  throw new Error('unsupported_agent');
}

export async function processProspectingAgentJobs(env, limit = 12) {
  const max = Math.max(1, Math.min(20, Number(limit || 12)));
  const results = [];
  for (let processed = 0; processed < max; processed += 1) {
    const job = await env.DB.prepare(`SELECT * FROM crm_agent_jobs WHERE status='queued' AND scheduled_at<=CURRENT_TIMESTAMP AND attempts<3 AND agent_key IN ('researcher','qualifier','personalizer') ORDER BY scheduled_at ASC, created_at ASC LIMIT 1`).first();
    if (!job) break;
    await env.DB.prepare("UPDATE crm_agent_jobs SET status='running', attempts=attempts+1, started_at=CURRENT_TIMESTAMP, error_message=NULL WHERE id=? AND status='queued'").bind(job.id).run();
    try {
      const output = await executeJob(env, job);
      await env.DB.prepare("UPDATE crm_agent_jobs SET status='completed', output_json=?, completed_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(JSON.stringify(output || {}), job.id).run();
      results.push({ id: job.id, agent: job.agent_key, status: 'completed', output });
    } catch (error) {
      const attempts = Number(job.attempts || 0) + 1;
      const terminal = attempts >= 3;
      await env.DB.prepare(`UPDATE crm_agent_jobs SET status=?, scheduled_at=CASE WHEN ?=1 THEN scheduled_at ELSE datetime('now','+30 minutes') END, error_message=?, completed_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?`)
        .bind(terminal ? 'failed' : 'queued', terminal ? 1 : 0, clean(error?.message || 'agent_error', 900), terminal ? 1 : 0, job.id).run();
      results.push({ id: job.id, agent: job.agent_key, status: terminal ? 'failed' : 'retry_scheduled', error: clean(error?.message || 'agent_error', 300) });
    }
  }
  const pending = await env.DB.prepare("SELECT agent_key,status,COUNT(*) total FROM crm_agent_jobs WHERE agent_key IN ('researcher','qualifier','personalizer') GROUP BY agent_key,status ORDER BY agent_key,status").all();
  return { processed: results.length, results, pending: pending.results, noOutbound: true, externalContactRequiresHumanApproval: true };
}

export async function handleProspectingAutomationRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/prospecting-automation')) return null;
  if (!isRobot(request, env)) return json({ error: 'unauthorized' }, { status: 401 });
  if (request.method === 'POST' && path === '/api/prospecting-automation/run') {
    return json(await processProspectingAgentJobs(env, Number(url.searchParams.get('limit') || 12)));
  }
  return json({ error: 'not_found' }, { status: 404 });
}

export { SUPPORTED_AGENTS, authorityScore, safePublicUrl };
