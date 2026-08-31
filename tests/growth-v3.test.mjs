import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Growth OS V3 cria fila persistente e deduplicada de alertas', async () => {
  const migration = await read('migrations/0015_growth_os_v3_notifications.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS crm_owner_notifications/);
  assert.match(migration, /dedupe_key TEXT NOT NULL UNIQUE/);
  assert.match(migration, /provider_attempts INTEGER NOT NULL DEFAULT 0/);
});

test('Growth OS V3 usa Meta WhatsApp Cloud API sem telefone hardcoded', async () => {
  const source = await read('backend/growth-v3.mjs');
  assert.match(source, /graph\.facebook\.com/);
  assert.match(source, /WHATSAPP_ACCESS_TOKEN/);
  assert.match(source, /WHATSAPP_PHONE_NUMBER_ID/);
  assert.match(source, /WHATSAPP_OWNER_NUMBER/);
  assert.match(source, /WHATSAPP_TEMPLATE_NAME/);
  assert.doesNotMatch(source, /18\s*99159\s*1228/);
  assert.match(source, /priorityScore/);
  assert.match(source, /Lead qualificado identificado/);
  assert.match(source, /Lead quente identificado/);
});

test('Worker integra entrada de lead, ações do painel e drenagem de notificações', async () => {
  const worker = await read('backend/worker-entry.mjs');
  assert.match(worker, /notifyInboundLead/);
  assert.match(worker, /notifyPanelMutation/);
  assert.match(worker, /notifyProspectingResponse/);
  assert.match(worker, /processOwnerNotifications/);
  assert.match(worker, /\/api\/notifications\/run/);
});

test('automação comercial drena alertas depois dos agentes', async () => {
  const workflow = await read('.github/workflows/prospecting-automation.yml');
  const queueIndex = workflow.indexOf('/api/prospecting-automation/run?limit=8');
  const notificationIndex = workflow.indexOf('/api/notifications/run?limit=30');
  assert.ok(queueIndex >= 0);
  assert.ok(notificationIndex > queueIndex);
});

test('deploy de produção sincroniza WhatsApp somente quando configuração está completa', async () => {
  const workflow = await read('.github/workflows/deploy-production.yml');
  assert.match(workflow, /Configurar alertas WhatsApp opcionais/);
  assert.match(workflow, /WHATSAPP_ACCESS_TOKEN/);
  assert.match(workflow, /WHATSAPP_OWNER_NUMBER/);
  assert.match(workflow, /fila de alertas permanece disponível sem bloquear o deploy/);
});

test('UI V3 expõe quem deve ser contatado e status do WhatsApp', async () => {
  const ui = await read('public/assets/growth-v3-ui.js');
  assert.match(ui, /Quem Victor deve contatar agora/);
  assert.match(ui, /Priority Score V3/);
  assert.match(ui, /Alertas do Growth OS no WhatsApp/);
});
