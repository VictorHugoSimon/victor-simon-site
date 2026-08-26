import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Fila social só enfileira conteúdo aprovado e agendado', async () => {
  const queue = await text('backend/publication-queue.mjs');
  assert.ok(queue.includes("c.status = 'scheduled'"));
  assert.ok(queue.includes('c.approved_at IS NOT NULL'));
  assert.ok(queue.includes("c.channel IN ('linkedin','instagram')"));
  assert.ok(queue.includes('approved_content_required'));
  assert.ok(queue.includes('channel_mismatch'));
});

test('Fila usa publishers oficiais e retry controlado', async () => {
  const queue = await text('backend/publication-queue.mjs');
  assert.ok(queue.includes("import { handleSocialRoute } from './social.mjs'"));
  assert.ok(queue.includes('retryDelay'));
  assert.ok(queue.includes("status: 'blocked_external'"));
  assert.ok(queue.includes("status: 'retry'"));
  assert.ok(queue.includes("status: 'failed'"));
  assert.ok(queue.includes("status: 'completed'"));
  assert.ok(queue.includes('max_attempts'));
});

test('Scheduler executa publicação antes do ciclo de aprendizado', async () => {
  const [entry, config] = await Promise.all([
    text('backend/worker-entry.mjs'),
    text('scripts/generate-wrangler-config.mjs')
  ]);
  assert.ok(entry.includes('processPublicationJobs(env, 10)'));
  assert.ok(entry.indexOf('processPublicationJobs(env, 10)') < entry.indexOf('runScheduledGrowthLoop(env)'));
  assert.ok(config.includes('PUBLIC_API_BASE'));
  assert.ok(config.includes('triggers: { crons: [growthCron] }'));
});

test('Atribuição pública possui CORS e rate-limit no entrypoint', async () => {
  const entry = await text('backend/worker-entry.mjs');
  assert.ok(entry.includes("path === '/api/growth-loop/touch'"));
  assert.ok(entry.includes('rateLimitGrowthTouch'));
  assert.ok(entry.includes('CF-Connecting-IP'));
  assert.ok(entry.includes("error: 'rate_limited'"));
  assert.ok(entry.includes('Access-Control-Allow-Origin'));
});
