import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }

test('Runner processa Researcher, Qualifier e Personalizer sem outbound automático', async () => {
  const runner = await text('backend/prospecting-runner.mjs');
  for (const marker of [
    "'researcher', 'qualifier', 'personalizer'",
    "policy: 'public_sources_only'",
    'requiresHumanApproval: true',
    'outboundSent: false',
    "purpose='prospecting_review'",
    "status='hot_lead'"
  ]) assert.ok(runner.includes(marker), `faltando marcador: ${marker}`);
  assert.ok(runner.includes("fetch(current.toString()"));
  assert.ok(runner.includes("attempts<3"));
  assert.ok(runner.includes("datetime('now','+30 minutes')"));
});

test('Worker expõe endpoint robótico e inclui prospecção no ciclo agendado', async () => {
  const worker = await text('backend/worker-entry.mjs');
  assert.ok(worker.includes("handleProspectingAutomationRoute"));
  assert.ok(worker.includes("path.startsWith('/api/prospecting-automation')"));
  assert.ok(worker.includes('await processProspectingAgentJobs(env, 12)'));
});

test('GitHub Actions aciona agentes de hora em hora e após deploy de produção', async () => {
  const workflow = await text('.github/workflows/prospecting-automation.yml');
  assert.ok(workflow.includes("cron: '37 * * * *'"));
  assert.ok(workflow.includes("workflows: ['Deploy PRODUCTION']"));
  assert.ok(workflow.includes('/api/prospecting-automation/run?limit=20'));
  assert.ok(workflow.includes('X-Robot-Key'));
});

test('Carteira inicial tem empresas reais, fila pública e zero envio externo', async () => {
  const migration = await text('migrations/0012_autonomous_prospecting_seed.sql');
  for (const company of ['Sol by RZK', 'Tereos Brasil', 'São Martinho', 'Jacto', 'Stara', 'Baldan', 'Marchesan', 'Coopercitrus']) {
    assert.ok(migration.includes(company), `empresa ausente: ${company}`);
  }
  assert.ok(migration.includes("'researcher','queued'"));
  assert.ok(migration.includes('public_sources_only'));
  assert.ok(migration.includes('human_approval_required'));
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});
