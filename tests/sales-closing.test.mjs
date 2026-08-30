import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }

test('Closing V1.1 cria histórico, propostas e follow-ups sem SQL destrutivo', async () => {
  const migration = await text('migrations/0010_sales_closing_v1.sql');
  for (const table of ['crm_opportunity_history', 'crm_proposals', 'crm_followups']) {
    assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.ok(migration.includes('approval_required INTEGER NOT NULL DEFAULT 1'));
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});

test('Closing V1.1 mantém fechamento e compartilhamento sob ação humana', async () => {
  const backend = await text('backend/sales-closing.mjs');
  assert.ok(backend.includes("const STAGES = ['discovery', 'meeting', 'diagnosis', 'proposal', 'negotiation', 'won', 'lost']"));
  assert.ok(backend.includes('requiresHumanApproval: true'));
  assert.ok(backend.includes('externallySent: false'));
  assert.ok(backend.includes('outboundSent: false'));
  assert.ok(backend.includes('/api/sales/proposals'));
  assert.ok(backend.includes('/api/sales/followups'));
});

test('Growth OS permite avançar etapa, gerar proposta e controlar follow-up', async () => {
  const ui = await text('public/assets/prospecting-ui.js');
  for (const marker of ['Salvar etapa', 'Proposta', 'Follow-up', 'Propostas Comerciais', 'Marcar compartilhada', 'Aceita / Fechar', 'Concluir']) {
    assert.ok(ui.includes(marker), `faltando marcador: ${marker}`);
  }
  assert.ok(ui.includes("window.confirm('Confirma que você compartilhou esta proposta manualmente com o cliente?')"));
  assert.ok(ui.includes('navigator.clipboard.writeText(proposal.content)'));
});

test('Roteador de prospecção delega /api/sales ao módulo de fechamento', async () => {
  const prospecting = await text('backend/prospecting.mjs');
  assert.ok(prospecting.includes("import { handleSalesClosingRoute } from './sales-closing.mjs'"));
  assert.ok(prospecting.includes('const salesClosing = await handleSalesClosingRoute(request, env)'));
});