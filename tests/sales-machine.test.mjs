import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }

test('Máquina Comercial V1 adiciona oportunidades e rascunhos sem migrations destrutivas', async () => {
  const migration = await text('migrations/0009_sales_machine_v1.sql');
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS crm_opportunities'));
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS crm_message_drafts'));
  assert.ok(migration.includes('approval_required INTEGER NOT NULL DEFAULT 1'));
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});

test('Handoff exige lead quente e mantém contato externo sob aprovação humana', async () => {
  const backend = await text('backend/prospecting.mjs');
  assert.ok(backend.includes("Number(contact.score || 0) < 80"));
  assert.ok(backend.includes("contact.consent_status === 'denied'"));
  assert.ok(backend.includes('requiresHumanApproval: true'));
  assert.ok(backend.includes('outboundSent: false'));
  assert.ok(backend.includes('/api/prospecting/opportunities'));
  assert.ok(backend.includes('/api/prospecting/drafts'));
});

test('Painel permite criar oportunidade, preparar, aprovar e copiar abordagem', async () => {
  const ui = await text('public/assets/prospecting-ui.js');
  for (const marker of ['Pipeline Comercial', 'Criar oportunidade', 'WhatsApp', 'LinkedIn', 'E-mail', 'Aprovar', 'Copiar abordagem']) {
    assert.ok(ui.includes(marker), `faltando marcador: ${marker}`);
  }
  assert.ok(ui.includes('Nenhuma mensagem é enviada automaticamente'));
  assert.ok(ui.includes('navigator.clipboard.writeText'));
});