import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }

test('CRM assistido possui contas, contatos, sinais, scoring, tarefas e auditoria', async () => {
  const migration = await text('migrations/0007_autonomous_crm.sql');
  for (const table of ['crm_accounts', 'crm_contacts', 'crm_signals', 'crm_scores', 'crm_activities', 'crm_tasks', 'crm_suppressions', 'crm_agent_jobs']) {
    assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});

test('Prospecção entrega leads quentes sem outbound autônomo', async () => {
  const [backend, panel, ui, worker] = await Promise.all([
    text('backend/prospecting.mjs'), text('public/painel.html'), text('public/assets/prospecting-ui.js'), text('backend/worker.mjs')
  ]);
  assert.ok(backend.includes('total >= 80'));
  assert.ok(backend.includes("contact.consent_status !== 'denied'"));
  assert.ok(backend.includes('requiresHumanApproval: true'));
  assert.ok(backend.includes("outbound: false"));
  assert.ok(panel.includes('outbound bloqueado por padrão'));
  assert.ok(ui.includes('nenhum envio automático'));
  assert.ok(worker.includes('handleProspectingRoute'));
});
