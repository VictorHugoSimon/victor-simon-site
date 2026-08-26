import coreWorker from './worker.mjs';
import { attachLeadAttribution, handleGrowthLoopRoute, runScheduledGrowthLoop } from './growth-loop.mjs';

async function maybeAttachLead(request, response, env, leadPayload) {
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
      const growthLoopResponse = await handleGrowthLoopRoute(request, env);
      if (growthLoopResponse) return growthLoopResponse;

      if (request.method === 'POST' && url.pathname.replace(/\/+$/, '') === '/api/leads') {
        let payload = null;
        try { payload = await request.clone().json(); } catch {}
        const response = await coreWorker.fetch(request, env, ctx);
        return maybeAttachLead(request, response, env, payload);
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
