import test from 'node:test';
import assert from 'node:assert/strict';
import { createToken, normalizeEmail, sha256, validateLead, verifyToken } from '../backend/lib.mjs';

test('normaliza e-mail', () => assert.equal(normalizeEmail('  VICTOR@EXAMPLE.COM '), 'victor@example.com'));

test('valida lead completo', () => {
  const result = validateLead({ name: 'Victor', email: 'v@example.com', challenge: 'Precisamos organizar o portfólio de projetos.', contactConsent: 'yes' });
  assert.equal(result.valid, true);
  assert.equal(result.lead.language, 'pt');
});

test('rejeita lead inválido', () => {
  const result = validateLead({ name: 'V', email: 'invalido', challenge: 'curto' });
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['name', 'email', 'challenge', 'contactConsent']);
});

test('gera SHA-256 estável', async () => {
  assert.equal(await sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('cria e verifica token HMAC', async () => {
  const secret = 'uma-chave-segura-com-mais-de-32-caracteres';
  const token = await createToken({ sub: 'admin' }, secret, 60);
  const payload = await verifyToken(token, secret);
  assert.equal(payload.sub, 'admin');
  assert.equal(await verifyToken(`${token}x`, secret), null);
});
