const API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
const TOKEN_KEY = 'vs_admin_token';
let draftsCache = [];
let proposalsCache = [];

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function countGroups(rows = []) { return rows.reduce((sum, row) => sum + Number(row.total || 0), 0); }
function money(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function shortDate(value) { return value ? new Date(value).toLocaleDateString('pt-BR') : '—'; }

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ''}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `HTTP_${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function get(path) { return request(path); }
function sendJson(path, method, body = {}) { return request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
function kpi(label, value, note) { return `<article class="growth-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`; }

function stageOptions(current) {
  const labels = { discovery: 'Discovery', meeting: 'Reunião', diagnosis: 'Diagnóstico', proposal: 'Proposta', negotiation: 'Negociação', won: 'Ganho', lost: 'Perdido' };
  return Object.entries(labels).map(([value, label]) => `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`).join('');
}

function ensureSalesMachineWorkspace() {
  const view = document.querySelector('[data-view-panel="prospecting"]');
  if (!view || document.querySelector('#salesPipelineSection')) return;
  view.insertAdjacentHTML('beforeend', `
    <section class="growth-panel" id="salesPipelineSection">
      <div class="growth-panel-head">
        <div><h2>Pipeline Comercial</h2><p>Leads quentes transformados em oportunidades com valor, probabilidade, próxima ação e etapa de fechamento.</p></div>
        <span class="growth-badge status ready">Máquina Comercial V1.1</span>
      </div>
      <div class="table-wrap">
        <table class="growth-table">
          <thead><tr><th>Oportunidade</th><th>Oferta</th><th>Score</th><th>Valor</th><th>Prob.</th><th>Etapa</th><th>Próxima ação</th><th>Ações</th></tr></thead>
          <tbody id="salesPipelineRows"></tbody>
        </table>
        <div class="growth-empty" id="salesPipelineEmpty">Carregando pipeline...</div>
      </div>
    </section>
    <section class="growth-panel" id="salesDraftsSection">
      <div class="growth-panel-head">
        <div><h2>Abordagens para aprovação</h2><p>Os agentes preparam a mensagem; você aprova e copia. Nenhuma mensagem é enviada automaticamente.</p></div>
        <span class="growth-badge status pending">aprovação humana obrigatória</span>
      </div>
      <div id="salesDrafts" class="growth-empty">Carregando abordagens...</div>
    </section>
    <section class="growth-panel" id="salesProposalsSection">
      <div class="growth-panel-head">
        <div><h2>Propostas Comerciais</h2><p>Rascunhos versionados, valor, condições e aceite acompanhados dentro do pipeline.</p></div>
        <span class="growth-badge">revisão antes do compartilhamento</span>
      </div>
      <div id="salesProposals" class="growth-empty">Carregando propostas...</div>
    </section>
    <section class="growth-panel" id="salesFollowupsSection">
      <div class="growth-panel-head">
        <div><h2>Follow-ups</h2><p>Cadência interna programada para você saber exatamente quem precisa de atenção e quando.</p></div>
        <span class="growth-badge status ready">sem envio autônomo</span>
      </div>
      <div class="table-wrap">
        <table class="growth-table">
          <thead><tr><th>Lead</th><th>#</th><th>Canal</th><th>Objetivo</th><th>Data</th><th>Status</th><th>Ação</th></tr></thead>
          <tbody id="salesFollowupRows"></tbody>
        </table>
        <div class="growth-empty" id="salesFollowupsEmpty">Carregando follow-ups...</div>
      </div>
    </section>
  `);
  if (!view.dataset.salesMachineBound) {
    view.dataset.salesMachineBound = '1';
    view.addEventListener('click', handleSalesAction);
  }
}

function renderPipeline(rows) {
  const body = document.querySelector('#salesPipelineRows');
  const empty = document.querySelector('#salesPipelineEmpty');
  if (!body || !empty) return;
  body.innerHTML = rows.map((item) => `<tr>
    <td><strong>${escapeHtml(item.contact_name)}</strong><br><span class="muted">${escapeHtml(item.account_name || '—')}</span></td>
    <td>${escapeHtml(item.offer_key || '—')}</td>
    <td><span class="growth-badge status ready">${Number(item.score || 0)}</span></td>
    <td>${money(item.estimated_value)}</td>
    <td>${Number(item.probability || 0)}%</td>
    <td><select data-stage-select="${escapeHtml(item.id)}" class="growth-btn">${stageOptions(item.stage)}</select></td>
    <td>${escapeHtml(item.next_action || '—')}<br><span class="muted">${shortDate(item.next_action_due_at)}</span></td>
    <td><div class="growth-actions" style="gap:6px;min-width:260px">
      <button class="growth-btn" data-save-opportunity="${escapeHtml(item.id)}" type="button">Salvar etapa</button>
      <button class="growth-btn primary" data-create-proposal="${escapeHtml(item.id)}" data-value="${Number(item.estimated_value || 0)}" type="button">Proposta</button>
      <button class="growth-btn" data-create-followups="${escapeHtml(item.id)}" type="button">Follow-up</button>
    </div></td>
  </tr>`).join('');
  empty.style.display = rows.length ? 'none' : 'block';
  if (!rows.length) empty.textContent = 'Nenhuma oportunidade aberta. Use “Criar oportunidade” em um lead quente.';
}

function draftCard(draft) {
  const approved = draft.status === 'approved';
  const rejected = draft.status === 'rejected';
  const actions = rejected
    ? `<button class="growth-btn" data-draft-status="draft" data-draft-id="${escapeHtml(draft.id)}" type="button">Reabrir</button>`
    : approved
      ? `<button class="growth-btn primary" data-copy-draft="${escapeHtml(draft.id)}" type="button">Copiar abordagem</button><button class="growth-btn" data-draft-status="draft" data-draft-id="${escapeHtml(draft.id)}" type="button">Voltar para revisão</button>`
      : `<button class="growth-btn primary" data-draft-status="approved" data-draft-id="${escapeHtml(draft.id)}" type="button">Aprovar</button><button class="growth-btn" data-draft-status="rejected" data-draft-id="${escapeHtml(draft.id)}" type="button">Rejeitar</button>`;
  return `<article class="channel-card">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <div><strong>${escapeHtml(draft.contact_name)}</strong><span>${escapeHtml(draft.account_name || '—')} · ${escapeHtml(draft.channel)}</span></div>
      <span class="status ${approved ? 'ready' : 'pending'}">${escapeHtml(draft.status)}</span>
    </div>
    ${draft.subject ? `<strong style="margin-top:10px">${escapeHtml(draft.subject)}</strong>` : ''}
    <p style="white-space:pre-wrap;margin-top:10px;color:#475467;font-size:.86rem">${escapeHtml(draft.body)}</p>
    <div class="growth-actions" style="margin-top:12px">${actions}</div>
  </article>`;
}

function renderDrafts(rows) {
  draftsCache = rows;
  const target = document.querySelector('#salesDrafts');
  if (!target) return;
  if (!rows.length) {
    target.className = 'growth-empty';
    target.textContent = 'Nenhuma abordagem preparada. Gere uma a partir de um lead quente.';
    return;
  }
  target.className = 'channel-grid';
  target.innerHTML = rows.map(draftCard).join('');
}

function proposalActions(proposal) {
  if (proposal.status === 'draft') return `<button class="growth-btn primary" data-proposal-status="approved" data-proposal-id="${escapeHtml(proposal.id)}" type="button">Aprovar</button>`;
  if (proposal.status === 'approved') return `<button class="growth-btn primary" data-copy-proposal="${escapeHtml(proposal.id)}" type="button">Copiar proposta</button><button class="growth-btn" data-proposal-status="shared" data-proposal-id="${escapeHtml(proposal.id)}" type="button">Marcar compartilhada</button>`;
  if (proposal.status === 'shared') return `<button class="growth-btn" data-copy-proposal="${escapeHtml(proposal.id)}" type="button">Copiar</button><button class="growth-btn primary" data-proposal-status="accepted" data-proposal-id="${escapeHtml(proposal.id)}" type="button">Aceita / Fechar</button><button class="growth-btn" data-proposal-status="rejected" data-proposal-id="${escapeHtml(proposal.id)}" type="button">Recusada</button>`;
  if (proposal.status === 'rejected') return `<button class="growth-btn" data-proposal-status="draft" data-proposal-id="${escapeHtml(proposal.id)}" type="button">Reabrir</button>`;
  return `<button class="growth-btn" data-copy-proposal="${escapeHtml(proposal.id)}" type="button">Copiar proposta</button>`;
}

function renderProposals(rows) {
  proposalsCache = rows;
  const target = document.querySelector('#salesProposals');
  if (!target) return;
  if (!rows.length) {
    target.className = 'growth-empty';
    target.textContent = 'Nenhuma proposta criada. Gere uma diretamente no Pipeline Comercial.';
    return;
  }
  target.className = 'channel-grid';
  target.innerHTML = rows.map((proposal) => `<article class="channel-card">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div><strong>${escapeHtml(proposal.title)}</strong><span>${escapeHtml(proposal.account_name || proposal.contact_name || '—')} · v${Number(proposal.version || 1)}</span></div>
      <span class="status ${['approved', 'shared', 'accepted'].includes(proposal.status) ? 'ready' : 'pending'}">${escapeHtml(proposal.status)}</span>
    </div>
    <strong style="font-size:1.25rem;margin-top:10px">${money(proposal.value)}</strong>
    <p style="white-space:pre-wrap;max-height:260px;overflow:auto;margin-top:10px;color:#475467;font-size:.82rem">${escapeHtml(proposal.content)}</p>
    <div class="growth-actions" style="margin-top:12px">${proposalActions(proposal)}</div>
  </article>`).join('');
}

function renderFollowups(rows) {
  const body = document.querySelector('#salesFollowupRows');
  const empty = document.querySelector('#salesFollowupsEmpty');
  if (!body || !empty) return;
  body.innerHTML = rows.map((item) => `<tr>
    <td><strong>${escapeHtml(item.contact_name)}</strong><br><span class="muted">${escapeHtml(item.account_name || '—')}</span></td>
    <td>${Number(item.sequence_no || 0)}</td>
    <td>${escapeHtml(item.channel)}</td>
    <td>${escapeHtml(item.objective)}</td>
    <td>${shortDate(item.due_at)}</td>
    <td><span class="growth-badge ${item.status === 'completed' ? 'status ready' : ''}">${escapeHtml(item.status)}</span></td>
    <td>${item.status === 'planned' ? `<div class="growth-actions" style="gap:6px"><button class="growth-btn primary" data-followup-status="completed" data-followup-id="${escapeHtml(item.id)}" type="button">Concluir</button><button class="growth-btn" data-followup-status="skipped" data-followup-id="${escapeHtml(item.id)}" type="button">Pular</button></div>` : '—'}</td>
  </tr>`).join('');
  empty.style.display = rows.length ? 'none' : 'block';
  if (!rows.length) empty.textContent = 'Nenhuma cadência criada para as oportunidades.';
}

async function loadProspectingWorkspace() {
  const kpis = document.querySelector('#prospectingKpis');
  if (!kpis || !sessionStorage.getItem(TOKEN_KEY)) return;
  ensureSalesMachineWorkspace();
  try {
    const [summary, agents, hot, accounts, pipeline, drafts, proposals, followups] = await Promise.all([
      get('/api/prospecting/summary'),
      get('/api/prospecting/agents'),
      get('/api/prospecting/hot-leads'),
      get('/api/prospecting/accounts'),
      get('/api/prospecting/opportunities'),
      get('/api/prospecting/drafts'),
      get('/api/sales/proposals'),
      get('/api/sales/followups')
    ]);
    kpis.innerHTML = [
      kpi('Empresas-alvo', countGroups(summary.accounts), 'pipeline ICP'),
      kpi('Contatos pesquisados', countGroups(summary.contacts), 'base assistida'),
      kpi('Leads quentes', summary.hot || 0, 'score ≥ 80'),
      kpi('Oportunidades', summary.opportunities || 0, `${money(summary.pipelineValue)} em pipeline`),
      kpi('Pipeline ponderado', money(summary.weightedPipeline), 'valor × probabilidade'),
      kpi('Revisões humanas', summary.openTasks || 0, 'nenhum envio automático')
    ].join('');

    const agentGrid = document.querySelector('#prospectingAgents');
    agentGrid.innerHTML = (agents.agents || []).map((agent, index) => `<article class="agent-card"><span class="agent-id">P${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(agent.name)}</strong><p>${escapeHtml(agent.purpose)}</p><footer><span class="growth-badge status ready">assistivo</span><span>sem outbound</span></footer></article>`).join('');

    const hotRows = hot.leads || [];
    document.querySelector('#prospectingHotLeads').innerHTML = hotRows.map((lead) => `<tr>
      <td>${escapeHtml(lead.name)}<br><span class="muted">${escapeHtml(lead.email || lead.linkedin_url || '—')}</span></td>
      <td>${escapeHtml(lead.account_name || '—')}</td>
      <td>${escapeHtml(lead.role || '—')}</td>
      <td><span class="growth-badge status ready">${Number(lead.score || 0)}</span></td>
      <td>
        <div class="growth-actions" style="gap:6px">
          <button class="growth-btn primary" data-handoff-contact="${escapeHtml(lead.id)}" type="button">Criar oportunidade</button>
          <button class="growth-btn" data-draft-contact="${escapeHtml(lead.id)}" data-channel="whatsapp" type="button">WhatsApp</button>
          <button class="growth-btn" data-draft-contact="${escapeHtml(lead.id)}" data-channel="linkedin" type="button">LinkedIn</button>
          <button class="growth-btn" data-draft-contact="${escapeHtml(lead.id)}" data-channel="email" type="button">E-mail</button>
        </div>
      </td>
    </tr>`).join('');
    const hotEmpty = document.querySelector('#prospectingHotEmpty');
    hotEmpty.style.display = hotRows.length ? 'none' : 'block';
    if (!hotRows.length) hotEmpty.textContent = 'Nenhum lead atingiu os critérios de handoff ainda.';

    const accountRows = accounts.accounts || [];
    document.querySelector('#prospectingAccounts').innerHTML = accountRows.map((account) => `<tr><td>${escapeHtml(account.name)}</td><td>${escapeHtml(account.industry || '—')}</td><td>${escapeHtml(account.region || '—')}</td><td>${Number(account.icp_score || 0)}</td><td><span class="growth-badge">${escapeHtml(account.status)}</span></td></tr>`).join('');
    const accountEmpty = document.querySelector('#prospectingAccountsEmpty');
    accountEmpty.style.display = accountRows.length ? 'none' : 'block';
    if (!accountRows.length) accountEmpty.textContent = 'Cadastre as primeiras empresas-alvo para iniciar a qualificação.';

    renderPipeline(pipeline.opportunities || []);
    renderDrafts(drafts.drafts || []);
    renderProposals(proposals.proposals || []);
    renderFollowups(followups.followups || []);
  } catch (error) {
    kpis.innerHTML = kpi('Prospecção', 'Pendente', error.message === 'HTTP_500' ? 'aplicar migrations do CRM' : 'API indisponível');
  }
}

function parseMoneyInput(value) {
  const normalized = String(value || '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

async function handleSalesAction(event) {
  const handoff = event.target.closest('[data-handoff-contact]');
  if (handoff) {
    const raw = window.prompt('Valor estimado desta oportunidade em reais:', '15000');
    if (raw === null) return;
    handoff.disabled = true;
    try {
      await sendJson(`/api/prospecting/hot-leads/${handoff.dataset.handoffContact}/handoff`, 'POST', { estimatedValue: parseMoneyInput(raw) });
      await loadProspectingWorkspace();
    } catch (error) {
      window.alert(`Não foi possível criar a oportunidade: ${error.message}`);
    } finally { handoff.disabled = false; }
    return;
  }

  const createDraft = event.target.closest('[data-draft-contact][data-channel]');
  if (createDraft) {
    createDraft.disabled = true;
    try {
      await sendJson(`/api/prospecting/contacts/${createDraft.dataset.draftContact}/draft`, 'POST', { channel: createDraft.dataset.channel });
      await loadProspectingWorkspace();
      document.querySelector('#salesDraftsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      window.alert(`Não foi possível preparar a abordagem: ${error.message}`);
    } finally { createDraft.disabled = false; }
    return;
  }

  const saveOpportunity = event.target.closest('[data-save-opportunity]');
  if (saveOpportunity) {
    const opportunityId = saveOpportunity.dataset.saveOpportunity;
    const stage = document.querySelector(`[data-stage-select="${CSS.escape(opportunityId)}"]`)?.value;
    if (!stage) return;
    saveOpportunity.disabled = true;
    try {
      const nextAction = ['won', 'lost'].includes(stage) ? undefined : window.prompt('Próxima ação comercial:', 'Acompanhar avanço e registrar retorno');
      await sendJson(`/api/sales/opportunities/${opportunityId}`, 'PATCH', { stage, ...(nextAction ? { nextAction } : {}) });
      await loadProspectingWorkspace();
    } catch (error) {
      window.alert(`Não foi possível atualizar a oportunidade: ${error.message}`);
    } finally { saveOpportunity.disabled = false; }
    return;
  }

  const createProposal = event.target.closest('[data-create-proposal]');
  if (createProposal) {
    const raw = window.prompt('Valor da proposta em reais:', String(Number(createProposal.dataset.value || 0) || 15000));
    if (raw === null) return;
    createProposal.disabled = true;
    try {
      await sendJson(`/api/sales/opportunities/${createProposal.dataset.createProposal}/proposals`, 'POST', { value: parseMoneyInput(raw) });
      await loadProspectingWorkspace();
      document.querySelector('#salesProposalsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      window.alert(`Não foi possível gerar a proposta: ${error.message}`);
    } finally { createProposal.disabled = false; }
    return;
  }

  const createFollowups = event.target.closest('[data-create-followups]');
  if (createFollowups) {
    createFollowups.disabled = true;
    try {
      await sendJson(`/api/sales/opportunities/${createFollowups.dataset.createFollowups}/followups`, 'POST', {});
      await loadProspectingWorkspace();
      document.querySelector('#salesFollowupsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      window.alert(`Não foi possível criar a cadência: ${error.message}`);
    } finally { createFollowups.disabled = false; }
    return;
  }

  const statusButton = event.target.closest('[data-draft-status][data-draft-id]');
  if (statusButton) {
    statusButton.disabled = true;
    try {
      await sendJson(`/api/prospecting/drafts/${statusButton.dataset.draftId}`, 'PATCH', { status: statusButton.dataset.draftStatus });
      await loadProspectingWorkspace();
    } catch (error) {
      window.alert(`Não foi possível atualizar a abordagem: ${error.message}`);
    } finally { statusButton.disabled = false; }
    return;
  }

  const proposalStatus = event.target.closest('[data-proposal-status][data-proposal-id]');
  if (proposalStatus) {
    const nextStatus = proposalStatus.dataset.proposalStatus;
    if (nextStatus === 'shared' && !window.confirm('Confirma que você compartilhou esta proposta manualmente com o cliente?')) return;
    if (nextStatus === 'accepted' && !window.confirm('Confirma o aceite comercial e o fechamento desta oportunidade?')) return;
    proposalStatus.disabled = true;
    try {
      await sendJson(`/api/sales/proposals/${proposalStatus.dataset.proposalId}`, 'PATCH', { status: nextStatus });
      await loadProspectingWorkspace();
    } catch (error) {
      window.alert(`Não foi possível atualizar a proposta: ${error.message}`);
    } finally { proposalStatus.disabled = false; }
    return;
  }

  const followupStatus = event.target.closest('[data-followup-status][data-followup-id]');
  if (followupStatus) {
    followupStatus.disabled = true;
    try {
      await sendJson(`/api/sales/followups/${followupStatus.dataset.followupId}`, 'PATCH', { status: followupStatus.dataset.followupStatus });
      await loadProspectingWorkspace();
    } catch (error) {
      window.alert(`Não foi possível atualizar o follow-up: ${error.message}`);
    } finally { followupStatus.disabled = false; }
    return;
  }

  const copyButton = event.target.closest('[data-copy-draft]');
  if (copyButton) {
    const draft = draftsCache.find((item) => item.id === copyButton.dataset.copyDraft);
    if (!draft || draft.status !== 'approved') return;
    const text = [draft.subject, draft.body].filter(Boolean).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      const original = copyButton.textContent;
      copyButton.textContent = 'Copiado';
      setTimeout(() => { copyButton.textContent = original; }, 1400);
    } catch {
      window.prompt('Copie a abordagem aprovada:', text);
    }
    return;
  }

  const copyProposal = event.target.closest('[data-copy-proposal]');
  if (copyProposal) {
    const proposal = proposalsCache.find((item) => item.id === copyProposal.dataset.copyProposal);
    if (!proposal || !['approved', 'shared', 'accepted'].includes(proposal.status)) return;
    try {
      await navigator.clipboard.writeText(proposal.content);
      const original = copyProposal.textContent;
      copyProposal.textContent = 'Proposta copiada';
      setTimeout(() => { copyProposal.textContent = original; }, 1400);
    } catch {
      window.prompt('Copie a proposta aprovada:', proposal.content);
    }
  }
}

window.loadProspectingWorkspace = loadProspectingWorkspace;