const API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
const TOKEN_KEY = 'vs_admin_token';

function token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }
function authHeaders() { return { Authorization: `Bearer ${token()}` }; }
function money(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function pct(value) { return `${Math.round(Number(value || 0))}%`; }
function date(value) { return value ? new Date(value).toLocaleDateString('pt-BR') : '—'; }

function showPanel(active) {
  const login = document.querySelector('#loginView');
  const panel = document.querySelector('#panelView');
  if (login) login.style.display = active ? 'none' : 'grid';
  if (panel) panel.classList.toggle('panel-hidden', !active);
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) }
  });
  if (response.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    showPanel(false);
    throw new Error('UNAUTHORIZED');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `HTTP_${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function sendJson(path, method, body) {
  return request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function setupNavigation() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.view;
      document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item === button));
      document.querySelectorAll('[data-view-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === view));
      if (view === 'prospecting') window.loadProspectingWorkspace?.();
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

function baseRecommendations(dashboard, posts) {
  const total = Number(dashboard.leads?.total || 0);
  const ready = Number(dashboard.ready || 0);
  const articleCount = posts.length;
  const items = [];
  if (articleCount < 4) items.push(['Conteúdo', 'Construir base editorial', 'Publicar os quatro artigos pilares para dar profundidade ao site e alimentar LinkedIn/Instagram.']);
  if (ready > 0) items.push(['CRM', 'Priorizar leads quentes', `${ready} lead(s) estão com score ≥ 70 e devem receber acompanhamento humano.`]);
  if (!total) items.push(['Aquisição', 'Ativar tracking de campanhas', 'Usar UTMs e origem do conteúdo para atribuir visitas, leads e oportunidades.']);
  items.push(['Automação', 'Conectar LinkedIn e Instagram', 'Próximo passo técnico: OAuth oficial, fila de aprovação, publicação e coleta de métricas.']);
  return items;
}

function renderRecommendationList(selector, items) {
  const target = document.querySelector(selector);
  if (!target) return;
  target.innerHTML = items.length ? items.map(([type, title, text], index) => `<article class="recommendation"><span class="icon">${index + 1}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div><span class="growth-badge">${escapeHtml(type)}</span></article>`).join('') : '<div class="growth-empty">Nenhuma recomendação aberta.</div>';
}

function contentCard(item) {
  const actions = [];
  if (item.status === 'draft' || item.status === 'researching') actions.push(`<button class="growth-btn" data-content-action="review" data-content-id="${escapeHtml(item.id)}">Enviar à revisão</button>`);
  if (item.status === 'review') {
    actions.push(`<button class="growth-btn primary" data-content-action="approve" data-content-id="${escapeHtml(item.id)}">Aprovar</button>`);
    actions.push(`<button class="growth-btn" data-content-action="reject" data-content-id="${escapeHtml(item.id)}">Rejeitar</button>`);
  }
  if (item.status === 'approved') actions.push(`<button class="growth-btn" data-content-action="schedule" data-content-id="${escapeHtml(item.id)}">Agendar</button>`);
  return `<article style="background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:12px;margin-bottom:8px"><span class="growth-badge">${escapeHtml(item.channel || 'blog')}</span><strong style="display:block;margin:8px 0 5px">${escapeHtml(item.title)}</strong><small style="color:#667085">${escapeHtml(item.pillar || '')}</small>${actions.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${actions.join('')}</div>` : ''}</article>`;
}

function ideaCard(item) {
  return `<article style="background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:12px;margin-bottom:8px"><span class="growth-badge">score ${Number(item.score || 0)}</span><strong style="display:block;margin:8px 0 5px">${escapeHtml(item.title)}</strong><small style="color:#667085">${escapeHtml(item.pillar || '')}</small></article>`;
}

function renderKanban(ideas, content) {
  const target = document.querySelector('#contentKanban');
  if (!target) return;
  const groups = {
    backlog: ideas.filter((item) => !['converted', 'archived'].includes(item.status)),
    production: content.filter((item) => ['draft', 'researching'].includes(item.status)),
    review: content.filter((item) => item.status === 'review'),
    approved: content.filter((item) => ['approved', 'scheduled'].includes(item.status)),
    published: content.filter((item) => item.status === 'published')
  };
  const columns = [
    ['Backlog', 'backlog', ideaCard],
    ['Produção', 'production', contentCard],
    ['Revisão', 'review', contentCard],
    ['Aprovado', 'approved', contentCard],
    ['Publicado', 'published', contentCard]
  ];
  target.innerHTML = columns.map(([label, key, renderer]) => `<div class="kanban-col"><h3>${label} · ${groups[key].length}</h3>${groups[key].length ? groups[key].map(renderer).join('') : '<div class="kanban-empty">Sem itens.</div>'}</div>`).join('');
  document.querySelector('#contentPipelineStatus').textContent = `${ideas.length} pautas · ${content.length} conteúdos`;
}

function renderCalendar(items) {
  const target = document.querySelector('#calendarQueue');
  if (!target) return;
  target.className = items.length ? '' : 'growth-empty';
  target.innerHTML = items.length ? `<table class="growth-table"><thead><tr><th>Data</th><th>Conteúdo</th><th>Canal</th><th>Status</th></tr></thead><tbody>${items.map((item) => `<tr><td>${date(item.scheduled_at)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.channel)}</td><td><span class="growth-badge">${escapeHtml(item.status)}</span></td></tr>`).join('')}</tbody></table>` : 'Nenhum conteúdo agendado.';
}

function renderAgentRuns(runs) {
  const target = document.querySelector('#agentRuns');
  if (!target) return;
  target.className = runs.length ? '' : 'growth-empty';
  target.innerHTML = runs.length ? `<table class="growth-table"><thead><tr><th>Agente</th><th>Status</th><th>Entrada</th><th>Duração</th><th>Execução</th></tr></thead><tbody>${runs.slice(0, 20).map((run) => `<tr><td>${escapeHtml(run.agent_key)}</td><td><span class="growth-badge">${escapeHtml(run.status)}</span></td><td>${escapeHtml(run.input_ref || '—')}</td><td>${run.duration_ms ? `${Math.round(run.duration_ms / 1000)}s` : '—'}</td><td>${date(run.created_at)}</td></tr>`).join('')}</tbody></table>` : 'Nenhum agente executado ainda.';
}

async function loadGrowthWorkspace() {
  const [summary, ideasData, contentData, calendarData, runsData, recommendationsData] = await Promise.all([
    request('/api/growth/summary'),
    request('/api/growth/ideas?limit=100'),
    request('/api/growth/content?limit=200'),
    request('/api/growth/calendar?days=90'),
    request('/api/growth/agents/runs'),
    request('/api/growth/recommendations')
  ]);
  renderKanban(ideasData.ideas || [], contentData.content || []);
  renderCalendar(calendarData.items || []);
  renderAgentRuns(runsData.runs || []);
  const dbRecs = (recommendationsData.recommendations || []).map((item) => [item.priority || 'IA', item.title, item.rationale || '']);
  if (dbRecs.length) {
    renderRecommendationList('#insightList', dbRecs);
    renderRecommendationList('#executiveRecommendations', dbRecs.slice(0, 4));
  }
  const contentTotal = (summary.content || []).reduce((sum, row) => sum + Number(row.total || 0), 0);
  const agentTotal = (summary.agents || []).reduce((sum, row) => sum + Number(row.total || 0), 0);
  const node = document.querySelector('#contentSummary');
  if (node && (contentTotal || agentTotal)) node.innerHTML += `<div style="margin-top:12px;color:#667085;font-size:.84rem">Growth OS: ${contentTotal} item(ns) editoriais · ${agentTotal} execução(ões) de agentes nos últimos 30 dias.</div>`;
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

  const seoPostCount = document.querySelector('#seoPostCount');
  if (seoPostCount) seoPostCount.textContent = posts.length;
  const seoKeywordCount = document.querySelector('#seoKeywordCount');
  if (seoKeywordCount) seoKeywordCount.textContent = keywordRows.length;

  const blogPostsTable = document.querySelector('#blogPostsTable');
  if (blogPostsTable) blogPostsTable.innerHTML = posts.length ? `<table class="growth-table"><thead><tr><th>Artigo</th><th>Categoria</th><th>Publicação</th></tr></thead><tbody>${posts.slice(0, 12).map((post) => `<tr><td>${escapeHtml(post.title)}</td><td>${escapeHtml(post.category || '—')}</td><td>${date(post.published_at)}</td></tr>`).join('')}</tbody></table>` : '<div class="growth-empty">Nenhum artigo publicado via API ainda. O blog público mantém conteúdos evergreen de fallback.</div>';

  renderRows('#readyLeads', '#readyEmpty', ready.leads || [], (lead) => `<tr><td>${escapeHtml(lead.name)}<br><span class="muted">${escapeHtml(lead.email)}</span></td><td>${escapeHtml(lead.company || '—')}</td><td>${escapeHtml(lead.service_interest || '—')}</td><td><span class="growth-badge">${lead.score}</span></td><td>${escapeHtml(lead.stage)}</td><td>${date(lead.created_at)}</td></tr>`);
  renderRows('#leads', '#leadsEmpty', leads.leads || [], (lead) => `<tr><td>${escapeHtml(lead.name)}</td><td>${escapeHtml(lead.email)}</td><td>${escapeHtml(lead.company || '—')}</td><td>${escapeHtml(lead.service_interest || '—')}</td><td>${lead.score}</td><td><span class="growth-badge">${escapeHtml(lead.stage)}</span></td></tr>`);

  const recs = baseRecommendations(dashboard, posts);
  renderRecommendationList('#executiveRecommendations', recs.slice(0, 4));
  renderRecommendationList('#insightList', recs);

  await loadGrowthWorkspace().catch((error) => {
    const status = document.querySelector('#contentPipelineStatus');
    if (status) status.textContent = error.status === 500 ? 'migration pendente' : 'Growth API indisponível';
    const agentRuns = document.querySelector('#agentRuns');
    if (agentRuns) agentRuns.textContent = 'O backend Growth OS será ativado após aplicar a migration 0003 no ambiente.';
  });
  await window.loadProspectingWorkspace?.();
}

function openDialog(id) { document.querySelector(`#${id}`)?.showModal(); }
function closeDialog(id) { document.querySelector(`#${id}`)?.close(); }

document.querySelector('#newIdeaButton')?.addEventListener('click', () => openDialog('ideaDialog'));
document.querySelector('#generateDraftButton')?.addEventListener('click', () => openDialog('generateDialog'));
document.querySelector('#generateDraftButtonSecondary')?.addEventListener('click', () => openDialog('generateDialog'));
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(button.dataset.closeDialog)));

document.querySelector('#ideaForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('#ideaStatus');
  status.className = 'form-status'; status.textContent = 'Salvando pauta…';
  try {
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.score = Number(data.score || 0);
    await sendJson('/api/growth/ideas', 'POST', data);
    status.className = 'form-status success'; status.textContent = 'Pauta criada.';
    event.currentTarget.reset();
    await loadGrowthWorkspace();
    setTimeout(() => closeDialog('ideaDialog'), 500);
  } catch (error) {
    status.className = 'form-status error'; status.textContent = `Não foi possível criar: ${error.message}`;
  }
});

document.querySelector('#generateForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('#generationStatus');
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  status.className = 'form-status'; status.textContent = 'Gerando rascunho com Workers AI…';
  submit.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const result = await sendJson('/api/growth/generate', 'POST', data);
    status.className = 'form-status success';
    status.textContent = `Rascunho criado: ${result.draft?.title || result.contentId}. Revise antes de aprovar.`;
    event.currentTarget.reset();
    await loadGrowthWorkspace();
  } catch (error) {
    status.className = 'form-status error';
    status.textContent = error.message === 'ai_binding_not_configured' ? 'Workers AI ainda não está vinculado a este ambiente.' : `Falha na geração: ${error.message}`;
  } finally { submit.disabled = false; }
});

document.querySelector('#contentKanban')?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-content-action]');
  if (!button) return;
  const id = button.dataset.contentId;
  const action = button.dataset.contentAction;
  button.disabled = true;
  try {
    if (action === 'review') await sendJson(`/api/growth/content/${id}`, 'PATCH', { status: 'review' });
    if (action === 'approve') await sendJson(`/api/growth/content/${id}/decision`, 'POST', { decision: 'approved' });
    if (action === 'reject') await sendJson(`/api/growth/content/${id}/decision`, 'POST', { decision: 'rejected', note: 'Retornado para ajustes pelo painel.' });
    if (action === 'schedule') {
      const value = window.prompt('Data/hora ISO para agendamento (ex.: 2026-08-28T09:00:00-03:00):');
      if (!value) return;
      await sendJson(`/api/growth/content/${id}`, 'PATCH', { status: 'scheduled', scheduledAt: value });
    }
    await loadGrowthWorkspace();
  } catch (error) {
    window.alert(`Não foi possível atualizar o conteúdo: ${error.message}`);
  } finally { button.disabled = false; }
});

setupNavigation();
if (token()) {
  showPanel(true);
  loadPanel().catch(() => showPanel(false));
} else {
  showPanel(false);
}
