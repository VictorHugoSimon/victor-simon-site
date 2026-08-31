import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('fila prioriza Personalizer e Qualifier antes de Researcher', async () => {
  const source = await read('backend/revenue-priority.mjs');
  assert.match(source, /priority: \['personalizer', 'qualifier', 'researcher'\]/);
  assert.match(source, /agent_key='personalizer'/);
  assert.match(source, /agent_key='qualifier'/);
  assert.match(source, /reduce_time_to_human_handoff/);
  assert.match(source, /externalContactRequiresHumanApproval: true/);
});

test('fila recupera jobs presos sem antecipar retries futuros', async () => {
  const source = await read('backend/revenue-priority.mjs');
  assert.match(source, /recovered_stale_running/);
  assert.match(source, /datetime\('now','-15 minutes'\)/);
  assert.match(source, /scheduled_at<=CURRENT_TIMESTAMP/);
});

test('fila encerra requalificação sem sinal novo e personalização redundante', async () => {
  const source = await read('backend/revenue-priority.mjs');
  assert.match(source, /active_draft_exists/);
  assert.match(source, /no_public_contact_channel/);
  assert.match(source, /no_new_signal_since_score/);
  assert.match(source, /json_extract\(crm_agent_jobs\.input_json,'\$\.contactId'\)/);
  assert.match(source, /json_extract\(crm_agent_jobs\.input_json,'\$\.accountId'\)/);
});

test('workflow prioriza receita antes de executar agentes', async () => {
  const workflow = await read('.github/workflows/prospecting-automation.yml');
  const priority = workflow.indexOf('/api/revenue-priority/run');
  const runner = workflow.indexOf('/api/prospecting-automation/run?limit=8');
  assert.ok(priority >= 0);
  assert.ok(runner > priority);
});

test('worker expõe e agenda a priorização de receita', async () => {
  const worker = await read('backend/worker-entry.mjs');
  assert.match(worker, /handleRevenuePriorityRoute/);
  assert.match(worker, /prioritizeRevenueQueue/);
  assert.match(worker, /path\.startsWith\('\/api\/revenue-priority'\)/);
});
