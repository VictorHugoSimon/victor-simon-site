const API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
const TOKEN_KEY = 'vs_admin_token';

function token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }
function authHeaders() { return { Authorization: `Bearer ${token()}` }; }
function money(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

function showPanel(active) {
  document.querySelector('#loginView').style.display = active ? 'none' : 'grid';
  document.querySelector('#panelView').classList.toggle('active', active);
}

async function request(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (response.status === 401) { sessionStorage.removeItem(TOKEN_KEY); showPanel(false); throw new Error('UNAUTHORIZED'); }
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json();
}

document.querySelector('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('#loginStatus');
  status.className = 'form-status'; status.textContent = 'Validando…';
  try {
    if (!API_BASE || API_BASE.includes('example.invalid')) throw new Error('API_NOT_CONFIGURED');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`${API_BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok || !data.token) throw new Error('INVALID_LOGIN');
    sessionStorage.setItem(TOKEN_KEY, data.token);
    showPanel(true); await loadPanel();
  } catch {
    status.className = 'form-status error'; status.textContent = 'Não foi possível entrar. Confira as credenciais e a API.';
  }
});

document.querySelector('#logoutButton').addEventListener('click', () => { sessionStorage.removeItem(TOKEN_KEY); showPanel(false); });

async function loadPanel() {
  const [dashboard, ready, leads] = await Promise.all([request('/api/dashboard'), request('/api/ready-leads'), request('/api/leads')]);
  const stages = Object.fromEntries((dashboard.stages || []).map((item) => [item.stage, Number(item.total)]));
  document.querySelector('#kpis').innerHTML = [
    ['Leads totais', dashboard.leads?.total || 0],
    ['Prontos', dashboard.ready || 0],
    ['Pipeline', money(dashboard.leads?.pipeline)],
    ['Conversão', `${dashboard.leads?.total ? Math.round(((stages.won || 0) / dashboard.leads.total) * 100) : 0}%`]
  ].map(([label, value]) => `<article class="card kpi"><span class="muted">${label}</span><strong>${value}</strong></article>`).join('');
  renderRows('#readyLeads', '#readyEmpty', ready.leads || [], (lead) => `<tr><td>${escapeHtml(lead.name)}<br><span class="muted">${escapeHtml(lead.email)}</span></td><td>${escapeHtml(lead.company || '—')}</td><td><span class="badge badge-ready">${lead.score}</span></td><td>${escapeHtml(lead.stage)}</td><td>${new Date(lead.created_at).toLocaleDateString('pt-BR')}</td></tr>`);
  renderRows('#leads', '#leadsEmpty', leads.leads || [], (lead) => `<tr><td>${escapeHtml(lead.name)}</td><td>${escapeHtml(lead.email)}</td><td>${escapeHtml(lead.company || '—')}</td><td>${lead.score}</td><td><span class="badge">${escapeHtml(lead.stage)}</span></td></tr>`);
}

function renderRows(bodySelector, emptySelector, rows, formatter) {
  document.querySelector(bodySelector).innerHTML = rows.map(formatter).join('');
  document.querySelector(emptySelector).style.display = rows.length ? 'none' : 'block';
  if (!rows.length) document.querySelector(emptySelector).textContent = 'Nenhum registro encontrado.';
}

if (token()) { showPanel(true); loadPanel().catch(() => showPanel(false)); } else showPanel(false);
