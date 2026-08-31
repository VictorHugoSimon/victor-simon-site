import { json } from './lib.mjs';

function isRobot(request, env) {
  const key = request.headers.get('X-Robot-Key') || String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return Boolean(env.ROBOT_KEY && key === env.ROBOT_KEY);
}

export async function prioritizeRevenueQueue(env) {
  const stale = await env.DB.prepare(`
    UPDATE crm_agent_jobs
    SET status='queued', scheduled_at=CURRENT_TIMESTAMP, started_at=NULL,
        error_message='recovered_stale_running'
    WHERE status='running'
      AND started_at IS NOT NULL
      AND started_at < datetime('now','-15 minutes')
      AND agent_key IN ('researcher','qualifier','personalizer')
  `).run();

  const personalizers = await env.DB.prepare(`
    UPDATE crm_agent_jobs
    SET scheduled_at=datetime('now','-3 days')
    WHERE status='queued'
      AND scheduled_at<=CURRENT_TIMESTAMP
      AND agent_key='personalizer'
  `).run();

  const qualifiers = await env.DB.prepare(`
    UPDATE crm_agent_jobs
    SET scheduled_at=datetime('now','-2 days')
    WHERE status='queued'
      AND scheduled_at<=CURRENT_TIMESTAMP
      AND agent_key='qualifier'
  `).run();

  const pending = await env.DB.prepare(`
    SELECT agent_key,status,COUNT(*) total
    FROM crm_agent_jobs
    WHERE agent_key IN ('researcher','qualifier','personalizer')
    GROUP BY agent_key,status
    ORDER BY CASE agent_key WHEN 'personalizer' THEN 1 WHEN 'qualifier' THEN 2 ELSE 3 END,status
  `).all();

  return {
    priority: ['personalizer', 'qualifier', 'researcher'],
    staleRecovered: Number(stale?.meta?.changes || 0),
    personalizersPrioritized: Number(personalizers?.meta?.changes || 0),
    qualifiersPrioritized: Number(qualifiers?.meta?.changes || 0),
    pending: pending.results || [],
    objective: 'reduce_time_to_human_handoff',
    noOutbound: true,
    externalContactRequiresHumanApproval: true
  };
}

export async function handleRevenuePriorityRoute(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/revenue-priority')) return null;
  if (!isRobot(request, env)) return json({ error: 'unauthorized' }, { status: 401 });
  if (request.method === 'POST' && path === '/api/revenue-priority/run') return json(await prioritizeRevenueQueue(env));
  return json({ error: 'not_found' }, { status: 404 });
}
