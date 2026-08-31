import { id, json, normalizeText } from './lib.mjs';

function clean(value, max = 500) { return normalizeText(value, max); }
function parseJson(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }
function isRobot(request, env) {
  const key = request.headers.get('X-Robot-Key') || String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return Boolean(env.ROBOT_KEY && key === env.ROBOT_KEY);
}
function hostKey(value) {
  try {
    const raw = String(value || '').trim();
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch { return ''; }
}

export async function importVerifiedPublicContacts(env) {
  const [verifiedResult, accountsResult] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM crm_verified_public_contacts WHERE status='verified' ORDER BY signal_score DESC,last_verified_at DESC LIMIT 100"),
    env.DB.prepare("SELECT id,name,website FROM crm_accounts WHERE COALESCE(website,'')<>'' ORDER BY icp_score DESC,updated_at DESC LIMIT 4000")
  ]);

  const accountsByHost = new Map();
  for (const account of accountsResult.results) {
    const host = hostKey(account.website);
    if (host && !accountsByHost.has(host)) accountsByHost.set(host, account);
  }

  const imported = [];
  const unmatched = [];
  let created = 0;
  let updated = 0;
  let signals = 0;
  let qualifiersQueued = 0;

  for (const verified of verifiedResult.results) {
    const account = accountsByHost.get(String(verified.host_key || '').toLowerCase().replace(/^www\./, ''));
    if (!account) {
      unmatched.push({ verifiedId: verified.id, host: verified.host_key, name: verified.name });
      continue;
    }

    let contact = await env.DB.prepare('SELECT * FROM crm_contacts WHERE account_id=? AND lower(name)=lower(?) LIMIT 1')
      .bind(account.id, verified.name).first();
    const metadata = {
      publicSource: true,
      verifiedPublicContactId: verified.id,
      evidenceUrl: verified.evidence_url,
      verification: parseJson(verified.metadata_json, {}),
      outbound: 'human_approval_required'
    };

    if (!contact) {
      const contactId = id('contact');
      await env.DB.prepare(`INSERT INTO crm_contacts (
        id,account_id,name,email,linkedin_url,role,language,status,source,consent_status,metadata_json
      ) VALUES (?,?,?,?,?,?,'pt','researched','verified_public_source','unknown',?)`)
        .bind(contactId, account.id, verified.name, clean(verified.email, 240), clean(verified.linkedin_url, 700), verified.role, JSON.stringify(metadata)).run();
      contact = { id: contactId };
      created += 1;
    } else {
      await env.DB.prepare(`UPDATE crm_contacts SET
        role=CASE WHEN COALESCE(role,'')='' OR source IN ('official_website','verified_public_source') THEN ? ELSE role END,
        linkedin_url=CASE WHEN COALESCE(linkedin_url,'')='' THEN ? ELSE linkedin_url END,
        email=CASE WHEN COALESCE(email,'')='' THEN ? ELSE email END,
        source=CASE WHEN source IN ('official_website','verified_public_source') THEN 'verified_public_source' ELSE source END,
        metadata_json=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=?`)
        .bind(verified.role, clean(verified.linkedin_url, 700), clean(verified.email, 240), JSON.stringify(metadata), contact.id).run();
      updated += 1;
    }

    const existingSignal = await env.DB.prepare(`SELECT id FROM crm_signals
      WHERE account_id=? AND signal_type='verified_public_decision_maker' AND evidence_url=? LIMIT 1`)
      .bind(account.id, verified.evidence_url).first();
    if (!existingSignal) {
      await env.DB.prepare(`INSERT INTO crm_signals (
        id,account_id,contact_id,signal_type,description,evidence_url,signal_score,metadata_json
      ) VALUES (?,?,?,'verified_public_decision_maker',?,?,?,?)`)
        .bind(id('signal'), account.id, contact.id, verified.signal_description, verified.evidence_url, Number(verified.signal_score || 75), JSON.stringify({
          verifiedPublicContactId: verified.id,
          publicSource: true,
          role: verified.role
        })).run();
      signals += 1;
    }

    const pendingQualifier = await env.DB.prepare("SELECT id FROM crm_agent_jobs WHERE agent_key='qualifier' AND status IN ('queued','running') AND input_json LIKE ? LIMIT 1")
      .bind(`%${account.id}%`).first();
    if (!pendingQualifier) {
      await env.DB.prepare(`INSERT INTO crm_agent_jobs (id,agent_key,status,input_json,scheduled_at)
        VALUES (?,'qualifier','queued',?,CURRENT_TIMESTAMP)`)
        .bind(id('job'), JSON.stringify({ accountId: account.id, contactId: contact.id, trigger: 'verified_public_contact', policy: 'public_sources_only' })).run();
      qualifiersQueued += 1;
    }

    imported.push({ accountId: account.id, company: account.name, contactId: contact.id, name: verified.name, role: verified.role, hasLinkedIn: Boolean(verified.linkedin_url) });
  }

  return {
    verified: verifiedResult.results.length,
    matched: imported.length,
    created,
    updated,
    signals,
    qualifiersQueued,
    imported,
    unmatched,
    noOutbound: true,
    externalContactRequiresHumanApproval: true
  };
}

export async function handleVerifiedContactImportRoute(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/prospecting-verified-contacts')) return null;
  if (!isRobot(request, env)) return json({ error: 'unauthorized' }, { status: 401 });
  if (request.method === 'POST' && path === '/api/prospecting-verified-contacts/run') return json(await importVerifiedPublicContacts(env));
  return json({ error: 'not_found' }, { status: 404 });
}
