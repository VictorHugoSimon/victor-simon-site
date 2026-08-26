const API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
const TOKEN_KEY = 'vs_admin_token';

function token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }
function authHeaders() { return { Authorization: `Bearer ${token()}` }; }
function money(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function pct(value) { return `${Math.round(Number(value || 0))}%`; }

function showPanel(active) {
  const login = document.querySelector('#loginView');
  const panel = document.querySelector('#panelView');
  if (login) login.style.display = active ? 'none' : 'grid';
  if (panel) panel.classList.toggle('panel-hidden', !active);
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
  if (response.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    showPanel(false);
    throw new Error('UNAUTHORIZED');
  }
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json();
}

function setupNavigation() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.view;
      document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item === button));
      document.querySelectorAll('[data-view-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === view));
    });
  });
}

const loginForm = document.querySelector('#loginForm');
loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('#loginStatus');
  status.className = 'form-status';
  status.textContent = 'Validando…';
  try {
    if (!API_BASE || API_BASE.includes('example.invalid')) throw new Error('API_NOT_CONFIGURED');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok || !data.token) throw new Error('INVALID_LOGIN');
    sessionStorage.setItem(TOKEN_KEY, data.token);
    showPanel(true);
    await loadPanel();
  } catch {
    status.className = 'form-status error';
    status.textContent = 'Não foi possível entrar. Confira as credenciais e a API.';
  }
});

document.querySelector('#logoutButton')?.addEventListener('click', () => {
  sessionStorage.removeItem(TOKEN_KEY);
  showPanel(false);
});

function kpiCards(items) {
  return items.map(([label, value, note]) => `<article class="growth-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note || '')}</small></article>`).join('');
}

function renderRows(bodySelector, emptySelector, rows, formatter) {
  const body = document.querySelector(bodySelector);
  const empty = document.querySelector(emptySelector);
  if (body) body.innerHTML = rows.map(formatter).join('');
  if (empty) {
    empty.style.display = rows.length ? 'none' : 'block';
    if (!rows.length) empty.textContent = 'Nenhum registro encontrado.';
  }
}

function recommendations(dashboard, posts) {
  const total = Number(dashboard.leads?.total || 0);
  const ready = Number(dashboard.ready || 0);
  const articleCount = posts.length;
  const items = [];
  if (articleCount < 4) items.push(['Conteúdo', 'Construir base editorial', 'Publicar os quatro artigos pilares para dar profundidade ao site e alimentar LinkedIn/Instagram.']);
  if (ready > 0) items.push(['CRM', 'Priorizar leads quentes', `${ready} lead(s) estão com score ≥ 70 e devem receber acompanhamento humano.`]);
  if (!total) items.push(['Aquisição', 'Ativar tracking de campanhas', 'Usar UTMs e origem do conteúdo para começar a atribuir visitas, leads e oportunidades.']);
  items.push(['Automação', 'Conectar LinkedIn e Instagram', 'Próximo passo técnico: OAuth oficial, fila de aprovação, publicação e coleta de métricas.']);
  return items;
}

function renderRecommendationList(selector, items) {
  const target = document.querySelector(selector);
  if (!target) return;
  target.innerHTML = items.map(([type, title, text], index) => `<article class="recommendation"><span class="icon">${index + 1}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div><span class="growth-badge">${escapeHtml(type)}</span></article>`).join('');
}

async function loadPanel() {
  const [dashboard, ready, leads, postsPt, keywords] = await Promise.all([
    request('/api/dashboard'),
    request('/api/ready-leads'),
    request('/api/leads'),
    request('/api/posts?lang=pt'),
    request('/api/seo/keywords')
  ]);
  const posts = postsPt.posts || [];
  const keywordRows = keywords.keywords || [];
  const stages = Object.fromEntries((dashboard.stages || []).map((item) => [item.stage, Number(item.total)]));
  const totalLeads = Number(dashboard.leads?.total || 0);
  const won = Number(stages.won || 0);
  const conversion = totalLeads ? (won / totalLeads) * 100 : 0;

  const growthKpis = document.querySelector('#growthKpis');
  if (growthKpis) growthKpis.innerHTML = kpiCards([
    ['Leads totais', totalLeads, 'base capturada'],
    ['Leads prontos', dashboard.ready || 0, 'score ≥ 70'],
    ['Pipeline estimado', money(dashboard.leads?.pipeline), 'oportunidades registradas'],
    ['Artigos publicados', posts.length, 'conteúdo proprietário']
  ]);

  const crmKpis = document.querySelector('#crmKpis');
  if (crmKpis) crmKpis.innerHTML = kpiCards([
    ['Leads', totalLeads, 'total'],
    ['Qualificados', (stages.qualified || 0) + (stages.ready || 0), 'em avanço'],
    ['Ganhos', won, 'won'],
    ['Conversão', pct(conversion), 'lead → ganho']
  ]);

  const funnel = document.querySelector('#funnelSummary');
  if (funnel) funnel.innerHTML = `<table class="growth-table"><thead><tr><th>Etapa</th><th>Total</th></tr></thead><tbody>${Object.entries(stages).map(([stage, count]) => `<tr><td><span class="growth-badge">${escapeHtml(stage)}</span></td><td>${count}</td></tr>`).join('') || '<tr><td colspan="2">Ainda sem leads no funil.</td></tr>'}</tbody></table>`;

  const contentSummary = document.querySelector('#contentSummary');
  if (contentSummary) contentSummary.innerHTML = `<div class="growth-grid" style="grid-template-columns:1fr 1fr;margin:0"><article class="growth-kpi"><span>Blog</span><strong>${posts.length}</strong><small>artigos publicados</small></article><article class="growth-kpi"><span>SEO</span><strong>${keywordRows.length}</strong><small>palavras-chave cadastradas</small></article></div>`;

  const publishedContent = document.querySelector('#publishedContent');
  if (publishedContent) publishedContent.innerHTML = posts.length ? posts.slice(0, 5).map((post) => `<div style="padding:8px 0;border-bottom:1px solid #eef2f6"><strong>${escapeHtml(post.title)}</strong><br><span>${escapeHtml(post.category || 'Blog')}</span></div>`).join('') : 'Nenhum artigo publicado ainda.';

  const seoPostCount = document.querySelector('#seoPostCount');
  if (seoPostCount) seoPostCount.textContent = posts.length;
  const seoKeywordCount = document.querySelector('#seoKeywordCount');
  if (seoKeywordCount) seoKeywordCount.textContent = keywordRows.length;

  const blogPostsTable = document.querySelector('#blogPostsTable');
  if (blogPostsTable) blogPostsTable.innerHTML = posts.length ? `<table class="growth-table"><thead><tr><th>Artigo</th><th>Categoria</th><th>Publicação</th></tr></thead><tbody>${posts.slice(0, 12).map((post) => `<tr><td>${escapeHtml(post.title)}</td><td>${escapeHtml(post.category || '—')}</td><td>${post.published_at ? new Date(post.published_at).toLocaleDateString('pt-BR') : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="growth-empty">Nenhum artigo publicado ainda.</div>';

  renderRows('#readyLeads', '#readyEmpty', ready.leads || [], (lead) => `<tr><td>${escapeHtml(lead.name)}<br><span class="muted">${escapeHtml(lead.email)}</span></td><td>${escapeHtml(lead.company || '—')}</td><td><span class="growth-badge">${lead.score}</span></td><td>${escapeHtml(lead.stage)}</td><td>${new Date(lead.created_at).toLocaleDateString('pt-BR')}</td></tr>`);
  renderRows('#leads', '#leadsEmpty', leads.leads || [], (lead) => `<tr><td>${escapeHtml(lead.name)}</td><td>${escapeHtml(lead.email)}</td><td>${escapeHtml(lead.company || '—')}</td><td>${lead.score}</td><td><span class="growth-badge">${escapeHtml(lead.stage)}</span></td></tr>`);

  const recs = recommendations(dashboard, posts);
  renderRecommendationList('#executiveRecommendations', recs.slice(0, 4));
  renderRecommendationList('#insightList', recs);
}

setupNavigation();
if (token()) {
  showPanel(true);
  loadPanel().catch(() => showPanel(false));
} else {
  showPanel(false);
}
