const API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
const TOKEN_KEY = 'vs_admin_token';

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function countGroups(rows = []) { return rows.reduce((sum, row) => sum + Number(row.total || 0), 0); }

async function get(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ''}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
  return data;
}

function kpi(label, value, note) { return `<article class="growth-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`; }

async function loadProspectingWorkspace() {
  const kpis = document.querySelector('#prospectingKpis');
  if (!kpis || !sessionStorage.getItem(TOKEN_KEY)) return;
  try {
    const [summary, agents, hot, accounts] = await Promise.all([
      get('/api/prospecting/summary'), get('/api/prospecting/agents'), get('/api/prospecting/hot-leads'), get('/api/prospecting/accounts')
    ]);
    kpis.innerHTML = [
      kpi('Empresas-alvo', countGroups(summary.accounts), 'pipeline ICP'),
      kpi('Contatos pesquisados', countGroups(summary.contacts), 'base assistida'),
      kpi('Leads quentes', summary.hot || 0, 'score ≥ 80'),
      kpi('Revisões humanas', summary.openTasks || 0, 'nenhum envio automático')
    ].join('');

    const agentGrid = document.querySelector('#prospectingAgents');
    agentGrid.innerHTML = (agents.agents || []).map((agent, index) => `<article class="agent-card"><span class="agent-id">P${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(agent.name)}</strong><p>${escapeHtml(agent.purpose)}</p><footer><span class="growth-badge status ready">assistivo</span><span>sem outbound</span></footer></article>`).join('');

    const hotRows = hot.leads || [];
    document.querySelector('#prospectingHotLeads').innerHTML = hotRows.map((lead) => `<tr><td>${escapeHtml(lead.name)}<br><span class="muted">${escapeHtml(lead.email || lead.linkedin_url || '—')}</span></td><td>${escapeHtml(lead.account_name || '—')}</td><td>${escapeHtml(lead.role || '—')}</td><td><span class="growth-badge status ready">${Number(lead.score || 0)}</span></td><td>revisão humana</td></tr>`).join('');
    const hotEmpty = document.querySelector('#prospectingHotEmpty');
    hotEmpty.style.display = hotRows.length ? 'none' : 'block';
    if (!hotRows.length) hotEmpty.textContent = 'Nenhum lead atingiu os critérios de handoff ainda.';

    const accountRows = accounts.accounts || [];
    document.querySelector('#prospectingAccounts').innerHTML = accountRows.map((account) => `<tr><td>${escapeHtml(account.name)}</td><td>${escapeHtml(account.industry || '—')}</td><td>${escapeHtml(account.region || '—')}</td><td>${Number(account.icp_score || 0)}</td><td><span class="growth-badge">${escapeHtml(account.status)}</span></td></tr>`).join('');
    const accountEmpty = document.querySelector('#prospectingAccountsEmpty');
    accountEmpty.style.display = accountRows.length ? 'none' : 'block';
    if (!accountRows.length) accountEmpty.textContent = 'Cadastre as primeiras empresas-alvo para iniciar a qualificação.';
  } catch (error) {
    kpis.innerHTML = kpi('Prospecção', 'Pendente', error.message === 'HTTP_500' ? 'aplicar migration 0007' : 'API indisponível');
  }
}

window.loadProspectingWorkspace = loadProspectingWorkspace;
