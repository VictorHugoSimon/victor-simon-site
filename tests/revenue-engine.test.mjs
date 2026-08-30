import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }

test('motor comercial possui ofertas, consentimento, newsletter e próxima ação', async () => {
  const [migration, worker, lib] = await Promise.all([
    text('migrations/0008_revenue_engine.sql'), text('backend/worker.mjs'), text('backend/lib.mjs')
  ]);
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS commercial_offers'));
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS lead_recommendations'));
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS newsletter_subscribers'));
  assert.ok(worker.includes("path === '/api/newsletter'"));
  assert.ok(worker.includes('INSERT INTO lead_recommendations'));
  assert.ok(lib.includes("errors.push('contactConsent')"));
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});

test('site apresenta três ofertas e captura interesse comercial', async () => {
  const [html, app] = await Promise.all([text('public/index.html'), text('public/assets/app.js')]);
  for (const offer of ['diagnostico-executivo', 'sprint-produto-delivery', 'automacao-dados-ia']) assert.ok(html.includes(offer));
  assert.ok(html.includes('name="contactConsent"'));
  assert.ok(html.includes('name="preferredContact"'));
  assert.ok(app.includes('data-service-select'));
  assert.ok(app.includes('/api/newsletter'));
});
