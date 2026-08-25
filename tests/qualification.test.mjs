import test from 'node:test';
import assert from 'node:assert/strict';
import { selectVariant } from '../backend/ab.mjs';
import { detectIntent, detectLanguage, firstReply } from '../backend/chatbot.mjs';
import { nextNurtureTouch } from '../backend/nurture.mjs';
import { qualifyLead } from '../backend/qualify.mjs';

test('qualifica lead quente', () => {
  const result = qualifyLead({
    challenge: 'Precisamos estruturar a governança de um portfólio complexo com vários times, riscos e dependências.',
    budget: '30k-80k',
    deadline: '30 dias urgente',
    authority: 'Sou o diretor e decisor',
    company: 'Empresa',
    phone: '5518999999999'
  });
  assert.equal(result.ready, true);
  assert.ok(result.score >= 70);
  assert.equal(result.nextStage, 'ready');
});

test('mantém lead inicial em nutrição', () => {
  const result = qualifyLead({ challenge: 'Quero entender um projeto.' });
  assert.equal(result.ready, false);
  assert.equal(result.nextStage, 'nurturing');
});

test('detecta idioma e intenção', () => {
  assert.equal(detectLanguage('I need help with my business project and timeline'), 'en');
  assert.equal(detectIntent('Preciso de orçamento e valor'), 'commercial');
  assert.equal(firstReply('Quero falar com um humano').escalate, true);
});

test('sequência de nutrição respeita dias', () => {
  const result = nextNurtureTouch('2026-08-01T00:00:00.000Z', 2, new Date('2026-08-07T00:00:00.000Z'));
  assert.equal(result.key, 'framework');
  assert.equal(result.due, true);
});

test('teste A/B permanece desligado por padrão', () => {
  assert.equal(selectVariant('visitor-123'), 'control');
  assert.equal(selectVariant('visitor-123', true), selectVariant('visitor-123', true));
});
