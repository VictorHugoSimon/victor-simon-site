import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }

test('Market Scout usa schema não destrutivo e fonte pública', async () => {
  const migration = await text('migrations/0013_continuous_market_scout.sql');
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS crm_scout_sources'));
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS crm_scout_candidates'));
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS crm_account_enrichment'));
  assert.ok(migration.includes('https://hubuniagro.com.br/'));
  assert.ok(migration.includes('campaign_market_scout_continuous'));
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});

test('Scout descobre empresas por links públicos e enfileira Researcher sem outbound', async () => {
  const backend = await text('backend/prospecting-maintenance.mjs');
  for (const marker of [
    'runMarketScout',
    'extractAnchors',
    "'researcher','queued'",
    'public_sources_only',
    'noOutbound: true',
    'source_timeout',
    'runProspectingMaintenance'
  ]) assert.ok(backend.includes(marker), `faltando marcador: ${marker}`);
});

test('Enriquecimento busca liderança somente em páginas públicas do mesmo domínio', async () => {
  const backend = await text('backend/prospecting-maintenance.mjs');
  assert.ok(backend.includes('internalCandidateLinks'));
  assert.ok(backend.includes('decision_maker_researcher'));
  assert.ok(backend.includes('NOME e CARGO aparecem literalmente'));
  assert.ok(backend.includes("source='official_website'"));
  assert.ok(backend.includes("trigger: 'intent_monitor'"));
});

test('Workflow executa manutenção e fila comercial duas vezes por hora com lote limitado', async () => {
  const workflow = await text('.github/workflows/prospecting-automation.yml');
  assert.ok(workflow.includes("cron: '7,37 * * * *'"));
  assert.ok(workflow.includes('/api/prospecting-maintenance/run'));
  assert.ok(workflow.includes('/api/prospecting-automation/run?limit=8'));
  assert.ok(workflow.includes('--max-time 300'));
});

test('Worker integra manutenção antes da fila comercial', async () => {
  const worker = await text('backend/worker-entry.mjs');
  assert.ok(worker.includes("import { handleProspectingMaintenanceRoute, runProspectingMaintenance } from './prospecting-maintenance.mjs'"));
  assert.ok(worker.includes("path.startsWith('/api/prospecting-maintenance')"));
  assert.ok(worker.includes('await runProspectingMaintenance(env)'));
});
