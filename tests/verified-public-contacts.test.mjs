import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }

test('Decisores públicos verificados usam schema não destrutivo e evidências', async () => {
  const migration = await text('migrations/0014_verified_public_contacts.sql');
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS crm_verified_public_contacts'));
  for (const marker of ['Paulo Macedo', 'Luís Gustavo Teixeira', 'Carlos Eduardo Faroni', 'Sebastião Abílio de Castro Junior']) {
    assert.ok(migration.includes(marker), `faltando decisor: ${marker}`);
  }
  assert.ok(migration.includes('human_approval_required'));
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});

test('Importador vincula por domínio, cria sinal e enfileira qualificação sem outbound', async () => {
  const backend = await text('backend/verified-contact-importer.mjs');
  for (const marker of [
    'crm_verified_public_contacts',
    'verified_public_source',
    'verified_public_decision_maker',
    "'qualifier','queued'",
    'human_approval_required',
    'noOutbound: true'
  ]) assert.ok(backend.includes(marker), `faltando marcador: ${marker}`);
});

test('Worker e workflow executam importação antes da fila comercial', async () => {
  const worker = await text('backend/worker-entry.mjs');
  const workflow = await text('.github/workflows/prospecting-automation.yml');
  assert.ok(worker.includes('handleVerifiedContactImportRoute'));
  assert.ok(worker.includes("path.startsWith('/api/prospecting-verified-contacts')"));
  assert.ok(worker.includes('await importVerifiedPublicContacts(env)'));
  assert.ok(workflow.includes('/api/prospecting-verified-contacts/run'));
  assert.ok(workflow.indexOf('/api/prospecting-verified-contacts/run') < workflow.indexOf('/api/prospecting-automation/run?limit=8'));
});
