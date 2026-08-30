import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }

test('Campanhas ICP usam schema não destrutivo e fila de pesquisa', async () => {
  const migration = await text('migrations/0011_prospecting_campaigns.sql');
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS crm_campaigns'));
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS crm_campaign_targets'));
  assert.ok(migration.includes('UNIQUE(campaign_id, account_id)'));
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});

test('Intake em lote deduplica, cria pesquisa e não envia outbound', async () => {
  const backend = await text('backend/prospecting-intake.mjs');
  assert.ok(backend.includes('byHost'));
  assert.ok(backend.includes('byName'));
  assert.ok(backend.includes("task_type='account_research'"));
  assert.ok(backend.includes("'researcher','queued'"));
  assert.ok(backend.includes("policy: 'public_sources_only'"));
  assert.ok(backend.includes('noOutbound: true'));
  assert.ok(backend.includes('targets.slice(0, 100)'));
});

test('Growth OS recebe lista de empresas e injeta UI de campanhas', async () => {
  const ui = await text('public/assets/prospecting-intake-ui.js');
  const build = await text('scripts/prepare-pages.mjs');
  for (const marker of ['Campanhas ICP & Entrada de Alvos', 'Criar campanha e fila', 'Empresas — uma por linha', 'fontes públicas · sem outbound']) {
    assert.ok(ui.includes(marker), `faltando marcador: ${marker}`);
  }
  assert.ok(build.includes('/assets/prospecting-intake-ui.js'));
});

test('Roteador comercial delega intake de prospecção antes das rotas sales', async () => {
  const closing = await text('backend/sales-closing.mjs');
  assert.ok(closing.includes("import { handleProspectingIntakeRoute } from './prospecting-intake.mjs'"));
  assert.ok(closing.includes('const intake = await handleProspectingIntakeRoute(request, env)'));
});