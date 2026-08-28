import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('contato direciona formulário e botão ao WhatsApp do Victor', async () => {
  const [html, app] = await Promise.all([
    text('public/index.html'),
    text('public/assets/app.js')
  ]);
  const number = '5518991591228';
  assert.ok(html.includes(`https://wa.me/${number}`));
  assert.ok(app.includes(`const WHATSAPP_NUMBER = '${number}'`));
  assert.ok(app.includes('window.location.assign(whatsappUrl)'));
  for (const field of ['name', 'email', 'company', 'phone', 'challenge', 'deadline', 'authority']) {
    assert.ok(app.includes(`value('${field}')`), `Mensagem do WhatsApp sem o campo ${field}`);
  }
  assert.ok(!html.includes('5518996809954'), 'Número antigo ainda presente na página.');
});
