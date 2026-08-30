const budgetPoints = {
  'ate-10k': 4,
  '10k-30k': 10,
  '30k-80k': 17,
  '80k-plus': 22,
  defined: 18
};

export function qualifyLead(lead = {}) {
  let score = 0;
  const reasons = [];
  const challenge = String(lead.challenge || '').toLowerCase();
  const budget = String(lead.budget || '').toLowerCase();
  const deadline = String(lead.deadline || '').toLowerCase();
  const authority = String(lead.authority || '').toLowerCase();
  const serviceInterest = String(lead.serviceInterest || '').toLowerCase();

  if (challenge.length >= 80) { score += 25; reasons.push('Problema descrito com clareza'); }
  else if (challenge.length >= 25) { score += 15; reasons.push('Problema identificado'); }

  const selectedBudget = Object.entries(budgetPoints).find(([key]) => budget.includes(key));
  if (selectedBudget) { score += selectedBudget[1]; reasons.push('Faixa de investimento informada'); }

  if (/urgente|30 dias|imediat|1 month/.test(deadline)) { score += 23; reasons.push('Prazo de curto alcance'); }
  else if (/60|90|trimestre|quarter/.test(deadline)) { score += 16; reasons.push('Prazo definido'); }
  else if (deadline) { score += 8; reasons.push('Prazo informado'); }

  if (/decisor|sócio|socio|diretor|owner|founder|ceo|responsável|responsavel/.test(authority)) {
    score += 20;
    reasons.push('Contato participa da decisão');
  } else if (authority) {
    score += 8;
    reasons.push('Papel na decisão informado');
  }

  if (lead.company) score += 6;
  if (lead.phone) score += 4;
  if (['diagnostico-executivo', 'sprint-produto-delivery', 'automacao-dados-ia'].includes(serviceInterest)) {
    score += 5;
    reasons.push('Solução de interesse definida');
  }

  score = Math.min(100, score);
  return {
    score,
    ready: score >= 70,
    reasons,
    nextStage: score >= 70 ? 'ready' : score >= 45 ? 'qualified' : 'nurturing'
  };
}

export function buildDossier(lead, qualification) {
  return {
    summary: `${lead.name}${lead.company ? `, ${lead.company}` : ''}: ${lead.challenge}`,
    score: qualification.score,
    reasons: qualification.reasons,
    budget: lead.budget || 'não informado',
    deadline: lead.deadline || 'não informado',
    serviceInterest: lead.serviceInterest || 'não informado',
    recommendedAction: qualification.ready
      ? 'Contato humano em até um dia útil com proposta de diagnóstico.'
      : 'Manter na régua automática de conteúdo e requalificar.'
  };
}
