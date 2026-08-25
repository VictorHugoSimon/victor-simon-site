export function detectLanguage(text = '') {
  const normalized = String(text).toLowerCase();
  const english = (normalized.match(/\b(the|and|project|business|need|help|cost|timeline)\b/g) || []).length;
  const portuguese = (normalized.match(/\b(o|e|projeto|empresa|preciso|ajuda|valor|prazo)\b/g) || []).length;
  return english > portuguese ? 'en' : 'pt';
}

export function detectIntent(text = '') {
  const normalized = String(text).toLowerCase();
  if (/preço|valor|orçamento|budget|price|cost/.test(normalized)) return 'commercial';
  if (/projeto|pmo|governança|processo|project|governance/.test(normalized)) return 'consulting';
  if (/sistema|software|integração|api|platform|integration/.test(normalized)) return 'technology';
  if (/humano|pessoa|atendente|human|agent/.test(normalized)) return 'human';
  return 'discovery';
}

export function firstReply(text = '') {
  const language = detectLanguage(text);
  const intent = detectIntent(text);
  const message = language === 'en'
    ? 'Thanks for reaching out. To direct this properly, what outcome do you need, what is the deadline, and who participates in the decision?'
    : 'Obrigado pelo contato. Para direcionar corretamente, qual resultado você precisa, qual é o prazo e quem participa da decisão?';
  return { language, intent, message, escalate: intent === 'human' };
}
