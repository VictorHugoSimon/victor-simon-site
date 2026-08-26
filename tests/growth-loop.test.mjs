import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { metricScores } from '../backend/growth-loop.mjs';

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Content Score é limitado e reage a performance real', () => {
  const empty = metricScores({});
  const strong = metricScores({
    impressions: 12000, reach: 8000, engagements: 900, clicks: 650, leads: 14,
    meetings: 5, proposals: 2, wins: 1, seoClicks: 300, seoImpressions: 6000, avgPosition: 4
  });
  assert.equal(empty.contentScore, 0);
  assert.ok(strong.contentScore > 50, `Score forte inesperadamente baixo: ${strong.contentScore}`);
  assert.ok(strong.contentScore <= 100);
  assert.ok(strong.engagementRate > 0);
  assert.ok(strong.clickRate > 0);
  assert.ok(strong.seoCtr > 0);
});

test('Migration Growth Loop é somente aditiva e cobre o funil de aprendizado', async () => {
  const sql = await text('migrations/0005_growth_loop.sql');
  for (const table of ['research_notes','attribution_touches','lead_attribution','content_performance_daily','publication_jobs','growth_cycles']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\b`, 'i'), `Tabela ausente: ${table}`);
  }
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i, 'Migration Growth Loop contém operação destrutiva.');
});

test('Worker entry preserva core e adiciona Growth Loop e cron', async () => {
  const [entry, config] = await Promise.all([
    text('backend/worker-entry.mjs'),
    text('scripts/generate-wrangler-config.mjs')
  ]);
  assert.ok(entry.includes("import coreWorker from './worker.mjs'"));
  assert.ok(entry.includes('handleGrowthLoopRoute'));
  assert.ok(entry.includes('attachLeadAttribution'));
  assert.ok(entry.includes('runScheduledGrowthLoop'));
  assert.ok(entry.includes('coreWorker.fetch'));
  assert.ok(config.includes("main: 'backend/worker-entry.mjs'"));
  assert.ok(config.includes('triggers: { crons: [growthCron] }'));
});

test('Growth Loop expõe agentes, pesquisa, métricas e ciclo completo', async () => {
  const api = await text('backend/growth-loop.mjs');
  for (const route of [
    '/api/growth-loop/touch', '/api/growth-loop/metrics', '/api/growth-loop/summary',
    '/api/growth-loop/research', '/api/growth-loop/radar', '/api/growth-loop/strategist',
    '/api/growth-loop/analytics', '/api/growth-loop/coach', '/api/growth-loop/run'
  ]) assert.ok(api.includes(route), `Rota ausente: ${route}`);
  for (const agent of ["'radar'", "'strategist'", "'researcher'", "'analytics'", "'growth_coach'"]) {
    assert.ok(api.includes(agent), `Agente ausente: ${agent}`);
  }
  assert.ok(api.includes('safeExternalUrl'), 'Pesquisador não protege URL externa.');
});

test('Site envia UTM e sessionId até a conversão', async () => {
  const app = await text('public/assets/app.js');
  for (const key of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','vh_content','vh_publication','vh_campaign']) {
    assert.ok(app.includes(key), `Atribuição sem ${key}`);
  }
  assert.ok(app.includes('/api/growth-loop/touch'));
  assert.ok(app.includes('payload.sessionId = sessionId()'));
  assert.ok(app.includes("payload.source = attribution.source || 'website'"));
});

test('Painel carrega controle do Growth Loop no build', async () => {
  const [ui, build] = await Promise.all([
    text('public/assets/growth-loop-ui.js'),
    text('scripts/prepare-pages.mjs')
  ]);
  for (const label of ['Growth Loop','Executar ciclo','Registrar métricas','Pesquisa por pauta','Top conteúdos']) {
    assert.ok(ui.includes(label), `UI sem ${label}`);
  }
  assert.ok(build.includes('/assets/growth-loop-ui.js') || build.includes("'growth-loop-ui.js'"));
});
