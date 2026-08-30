import { bearerToken, id, json, normalizeText, parseJson, verifyToken } from './lib.mjs';

async function requireAdmin(request, env) {
  return (await verifyToken(bearerToken(request), env.AUTH_SECRET)) ? null : json({ error: 'unauthorized' }, { status: 401 });
}

function clean(value, max = 500) { return normalizeText(value, max); }
function clamp(value, fallback = 60) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
}
function safeUrl(value) {
  const raw = clean(value, 600);
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.href.replace(/\/$/, '');
  } catch { return ''; }
}
function hostKey(value) {
  const url = safeUrl(value);
  if (!url) return '';
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
function nameKey(value) {
  return clean(value, 180).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function parseMeta(value) { try { return JSON.parse(value || '{}'); } catch { return {}; } }

async function listCampaigns(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare(`
    SELECT c.*,
      COUNT(t.id) target_count,
      SUM(CASE WHEN t.research_status='queued' THEN 1 ELSE 0 END) queued_count,
      SUM(CASE WHEN t.research_status='completed' THEN 1 ELSE 0 END) researched_count
    FROM crm_campaigns c
    LEFT JOIN crm_campaign_targets t ON t.campaign_id=c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT 100
  `).all();
  return json({ campaigns: result.results.map((row) => ({ ...row, goals: parseMeta(row.goals_json) })) });
}

async function createCampaign(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 20_000);
  const name = clean(body.name, 180);
  if (name.length < 3) return json({ error: 'validation_error', field: 'name' }, { status: 422 });
  const campaignId = id('campaign');
  await env.DB.prepare(`
    INSERT INTO crm_campaigns (id,name,offer_key,industry,region,default_icp_score,status,source,goals_json)
    VALUES (?,?,?,?,?,?,'active','manual_intake',?)
  `).bind(
    campaignId,
    name,
    clean(body.offerKey, 100),
    clean(body.industry, 120),
    clean(body.region, 120),
    clamp(body.defaultIcpScore, 60),
    JSON.stringify(body.goals || {})
  ).run();
  return json({ id: campaignId, name }, { status: 201 });
}

async function campaignTargets(request, env, campaignId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const campaign = await env.DB.prepare('SELECT id,name FROM crm_campaigns WHERE id=?').bind(campaignId).first();
  if (!campaign) return json({ error: 'not_found' }, { status: 404 });
  const result = await env.DB.prepare(`
    SELECT t.*,a.name,a.website,a.industry,a.region,a.offer_key,a.icp_score,a.status account_status,
      (SELECT COUNT(*) FROM crm_tasks k WHERE k.account_id=a.id AND k.task_type='account_research' AND k.status='open') open_research_tasks
    FROM crm_campaign_targets t
    JOIN crm_accounts a ON a.id=t.account_id
    WHERE t.campaign_id=?
    ORDER BY t.priority DESC,t.created_at DESC
  `).bind(campaignId).all();
  return json({ campaign, targets: result.results });
}

async function bulkTargets(request, env, campaignId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 150_000);
  const campaign = await env.DB.prepare('SELECT * FROM crm_campaigns WHERE id=?').bind(campaignId).first();
  if (!campaign) return json({ error: 'not_found' }, { status: 404 });
  const targets = Array.isArray(body.targets) ? body.targets.slice(0, 100) : [];
  if (!targets.length) return json({ error: 'targets_required' }, { status: 422 });

  const existingResult = await env.DB.prepare('SELECT id,name,website,metadata_json FROM crm_accounts ORDER BY created_at DESC LIMIT 3000').all();
  const byHost = new Map();
  const byName = new Map();
  for (const account of existingResult.results) {
    const h = hostKey(account.website);
    const n = nameKey(account.name);
    if (h && !byHost.has(h)) byHost.set(h, account);
    if (n && !byName.has(n)) byName.set(n, account);
  }

  const created = [];
  const reused = [];
  const skipped = [];
  for (const item of targets) {
    const name = clean(item?.name, 180);
    if (name.length < 2) { skipped.push({ name, reason: 'invalid_name' }); continue; }
    const website = safeUrl(item?.website);
    const h = hostKey(website);
    const n = nameKey(name);
    let account = (h && byHost.get(h)) || byName.get(n);
    let wasCreated = false;
    const priority = clamp(item?.icpScore, Number(campaign.default_icp_score || 60));
    const industry = clean(item?.industry || campaign.industry, 120);
    const region = clean(item?.region || campaign.region, 120);
    const offerKey = clean(item?.offerKey || campaign.offer_key, 100);

    if (!account) {
      const accountId = id('account');
      const metadata = { campaignId, intake: true, researchPolicy: 'public_sources_only' };
      await env.DB.prepare(`
        INSERT INTO crm_accounts (id,name,website,industry,region,offer_key,icp_score,status,source,metadata_json)
        VALUES (?,?,?,?,?,?,?,'researching',?,?)
      `).bind(accountId, name, website, industry, region, offerKey, priority, `campaign:${campaignId}`, JSON.stringify(metadata)).run();
      account = { id: accountId, name, website };
      wasCreated = true;
      if (h) byHost.set(h, account);
      byName.set(n, account);
    } else {
      await env.DB.prepare(`
        UPDATE crm_accounts SET
          website=CASE WHEN COALESCE(website,'')='' THEN ? ELSE website END,
          industry=CASE WHEN COALESCE(industry,'')='' THEN ? ELSE industry END,
          region=CASE WHEN COALESCE(region,'')='' THEN ? ELSE region END,
          offer_key=CASE WHEN COALESCE(offer_key,'')='' THEN ? ELSE offer_key END,
          icp_score=CASE WHEN icp_score<? THEN ? ELSE icp_score END,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(website, industry, region, offerKey, priority, priority, account.id).run();
    }

    await env.DB.prepare(`
      INSERT INTO crm_campaign_targets (id,campaign_id,account_id,priority,research_status,notes)
      VALUES (?,?,?,?,'queued',?)
      ON CONFLICT(campaign_id,account_id) DO UPDATE SET
        priority=CASE WHEN excluded.priority>priority THEN excluded.priority ELSE priority END,
        updated_at=CURRENT_TIMESTAMP
    `).bind(id('target'), campaignId, account.id, priority, clean(item?.notes, 500)).run();

    const task = await env.DB.prepare(`SELECT id FROM crm_tasks WHERE account_id=? AND task_type='account_research' AND status='open' LIMIT 1`).bind(account.id).first();
    if (!task) {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO crm_tasks (id,account_id,task_type,title,status,priority,approval_required,due_at,metadata_json)
          VALUES (?,?,'account_research',?,'open',?,0,datetime('now','+1 day'),?)
        `).bind(id('task'), account.id, `Pesquisar empresa-alvo: ${name}`, priority, JSON.stringify({ campaignId, publicSourcesOnly: true, noOutbound: true })),
        env.DB.prepare(`
          INSERT INTO crm_agent_jobs (id,agent_key,status,input_json,scheduled_at)
          VALUES (?,'researcher','queued',?,CURRENT_TIMESTAMP)
        `).bind(id('job'), JSON.stringify({ accountId: account.id, campaignId, company: name, website, policy: 'public_sources_only' }))
      ]);
    }
    (wasCreated ? created : reused).push({ accountId: account.id, name, priority });
  }

  return json({ campaignId, created, reused, skipped, totalAccepted: created.length + reused.length, noOutbound: true }, { status: 201 });
}

export async function handleProspectingIntakeRoute(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/prospecting-intake')) return null;
  if (request.method === 'GET' && path === '/api/prospecting-intake/campaigns') return listCampaigns(request, env);
  if (request.method === 'POST' && path === '/api/prospecting-intake/campaigns') return createCampaign(request, env);
  const targetMatch = path.match(/^\/api\/prospecting-intake\/campaigns\/([a-zA-Z0-9_-]+)\/targets$/);
  if (request.method === 'GET' && targetMatch) return campaignTargets(request, env, targetMatch[1]);
  const bulkMatch = path.match(/^\/api\/prospecting-intake\/campaigns\/([a-zA-Z0-9_-]+)\/targets\/bulk$/);
  if (request.method === 'POST' && bulkMatch) return bulkTargets(request, env, bulkMatch[1]);
  return json({ error: 'not_found' }, { status: 404 });
}