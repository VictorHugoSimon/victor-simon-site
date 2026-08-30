import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/consultoria.html', import.meta.url), 'utf8');

test('landing comercial possui os tres formatos de oferta', () => {
  assert.match(html, /Diagnóstico Executivo/);
  assert.match(html, /Sprint de Produto & Delivery/);
  assert.match(html, /Automação, Dados & IA/);
});

test('landing comercial direciona para o WhatsApp correto', () => {
  assert.match(html, /wa\.me\/5518991591228/);
  assert.match(html, /whatsappNumber = '5518991591228'/);
});

test('landing comercial possui CTA mobile e formulario qualificador', () => {
  assert.match(html, /class="sales-primary mobile-cta"/);
  assert.match(html, /id="salesForm"/);
  assert.match(html, /name="challenge"/);
});
