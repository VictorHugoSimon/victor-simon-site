export const nurtureSequence = [
  { day: 0, key: 'diagnosis', pt: 'Material de diagnóstico inicial', en: 'Initial diagnosis material' },
  { day: 2, key: 'case', pt: 'Caso prático relacionado ao desafio', en: 'Practical case related to the challenge' },
  { day: 5, key: 'framework', pt: 'Framework aplicável ao cenário', en: 'Framework applicable to the scenario' },
  { day: 9, key: 'invitation', pt: 'Convite para uma conversa objetiva', en: 'Invitation to a focused conversation' }
];

export function nextNurtureTouch(createdAt, touchesSent = 0, now = new Date()) {
  const touch = nurtureSequence[touchesSent];
  if (!touch) return null;
  const due = new Date(createdAt);
  due.setUTCDate(due.getUTCDate() + touch.day);
  return { ...touch, due: due <= now, dueAt: due.toISOString() };
}
