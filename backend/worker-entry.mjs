import coreWorker from './worker.mjs';
import { attachLeadAttribution, handleGrowthLoopRoute, runScheduledGrowthLoop } from './growth-loop.mjs';

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.CORS_ORIGIN || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origin) return configured[0] || '*';
  if (configured.includes(origin)) return origin;
  return configured.length === 0 ? origin : '';
}

function withGrowthHeaders(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = allowedOrigin(request, env);
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Robot-Key');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function maybeAttachLead(response, env, leadPayload) {
  if (!leadPayload?.sessionId || !response?.ok) return response;
  try {
    const data = await response.clone().json();
    if (data?.id) await attachLeadAttribution(env, data.id, String(leadPayload.sessionId).slice(0, 120));
  } catch (error) {
    console.error('lead_attribution_error', { message: error?.message });
  }
  return response;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';
      if (path.startsWith('/api/growth-loop')) {
        if (request.method === 'OPTIONS') return withGrowthHeaders(new Response(null, { status: 204 }), request, env);
        if (request.headers.get('Origin') && !allowedOrigin(request, env)) {
          return withGrowthHeaders(new Response(JSON.stringify({ error: 'origin_not_allowed' }), { status: 403, headers: { 'Content-Type': 'application/json' } }), request, env);
        }
        const growthLoopResponse = await handleGrowthLoopRoute(request, env);
        if (growthLoopResponse) return withGrowthHeaders(growthLoopResponse, request, env);
      }

      if (request.method === 'POST' && path === '/api/leads') {
        let payload = null;
        try { payload = await request.clone().json(); } catch {}
        const response = await coreWorker.fetch(request, env, ctx);
        return maybeAttachLead(response, env, payload);
      }
      return coreWorker.fetch(request, env, ctx);
    } catch (error) {
      console.error('worker_entry_error', { message: error?.message, stack: error?.stack });
      return coreWorker.fetch(request, env, ctx);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        await runScheduledGrowthLoop(env);
      } catch (error) {
        console.error('growth_loop_cron_error', { cron: controller?.cron, message: error?.message });
      }
    })());
  }
};
