const LOOP_API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
const LOOP_TOKEN_KEY = 'vs_admin_token';

function loopToken() { return sessionStorage.getItem(LOOP_TOKEN_KEY) || ''; }
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c])); }
function n(value) { return new Intl.NumberFormat('pt-BR').format(Number(value || 0)); }
function money(value) { return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(value || 0)); }
function dateTime(value) { return value ? new Date(value).toLocaleString('pt-BR') : '—'; }

async function loopRequest(path, options = {}) {
  const response = await fetch(`${LOOP_API_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${loopToken()}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
  return data;
}

async function loopJson(path, body) {
  return loopRequest(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
}

function activateLoopView() {
  document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === 'growth-loop'));
  document.querySelectorAll('[data-view-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === 'growth-loop'));
  loadGrowthLoop().catch(showLoopError);
}

function installGrowthLoopView() {
  if (document.querySelector('[data-view="growth-loop"]')) return;
  const nav = document.querySelector('.growth-nav');
  const main = document.querySelector('.growth-main');
  if (!nav || !main) return;

  const group = document.createElement('div');
  group.className = 'group';
  group.textContent = 'Inteligência';
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.view = 'growth-loop';
  button.textContent = 'Growth Loop';
  button.addEventListener('click', activateLoopView);
  nav.append(group, button);

  const panel = document.createElement('div');
  panel.className = 'growth-view';
  panel.dataset.viewPanel = 'growth-loop';
  panel.innerHTML = `
    <div class="growth-head">
      <div><h1>Growth Loop</h1><p>Radar → estratégia → pesquisa → conteúdo → distribuição → métricas → aprendizado.</p></div>
      <div class="growth-actions">
        <button class="growth-btn" id="loopRefresh" type="button">Atualizar</button>
        <button class="growth-btn primary" id="loopRunAll" type="button">✦ Executar ciclo</button>
      </div>
    </div>
    <div class="growth-grid" id="loopKpis"></div>
    <div class="growth-two">
      <section class="growth-panel">
        <div class="growth-panel-head"><div><h2>Agentes do ciclo</h2><p>Execução manual segura; nenhum agente publica sem aprovação.</p></div></div>
        <div class="growth-actions" style="flex-wrap:wrap">
          <button class="growth-btn" data-loop-agent="radar">Radar</button>
          <button class="growth-btn" data-loop-agent="strategist">Estrategista</button>
          <button class="growth-btn" data-loop-agent="analytics">Analytics</button>
          <button class="growth-btn" data-loop-agent="coach">Growth Coach</button>
        </div>
        <div class="form-status" id="loopStatus" aria-live="polite"></div>
      </section>
      <section class="growth-panel">
        <div class="growth-panel-head"><div><h2>Atribuição</h2><p>First touch por origem nos leads convertidos.</p></div></div>
        <div id="loopAttribution" class="growth-empty">Carregando...</div>
      </section>
    </div>
    <section class="growth-panel">
      <div class="growth-panel-head"><div><h2>Top conteúdos — 30 dias</h2><p>Content Score pondera alcance, engajamento, tráfego, leads, SEO e conversão.</p></div></div>
      <div class="table-wrap"><table class="growth-table"><thead><tr><th>Conteúdo</th><th>Canal</th><th>Score</th><th>Impressões</th><th>Cliques</th><th>Leads</th></tr></thead><tbody id="loopTopContent"></tbody></table></div>
    </section>
    <div class="growth-two">
      <section class="growth-panel">
        <div class="growth-panel-head"><div><h2>Registrar métricas</h2><p>Entrada manual/API enquanto os conectores de analytics reais não estiverem autorizados.</p></div></div>
        <form id="loopMetricForm">
          <div class="field"><label>ID do conteúdo</label><input name="contentItemId" required></div>
          <div class="field"><label>Canal</label><select name="channel"><option>linkedin</option><option>instagram</option><option>blog</option><option>newsletter</option><option>website</option></select></div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
            <div class="field"><label>Impressões</label><input name="impressions" type="number" min="0" value="0"></div>
            <div class="field"><label>Engajamentos</label><input name="engagements" type="number" min="0" value="0"></div>
            <div class="field"><label>Cliques</label><input name="clicks" type="number" min="0" value="0"></div>
            <div class="field"><label>Leads</label><input name="leads" type="number" min="0" value="0"></div>
            <div class="field"><label>Reuniões</label><input name="meetings" type="number" min="0" value="0"></div>
            <div class="field"><label>Propostas</label><input name="proposals" type="number" min="0" value="0"></div>
          </div>
          <button class="growth-btn primary" type="submit">Calcular e salvar score</button>
        </form>
      </section>
      <section class="growth-panel">
        <div class="growth-panel-head"><div><h2>Pesquisa por pauta</h2><p>Fonte HTTPS é lida, resumida e armazenada para revisão humana.</p></div></div>
        <form id="loopResearchForm">
          <div class="field"><label>ID da pauta</label><input name="ideaId" required></div>
          <div class="field"><label>URL da fonte</label><input name="sourceUrl" type="url" required placeholder="https://..."></div>
          <button class="growth-btn primary" type="submit">Executar Pesquisador</button>
        </form>
      </section>
    </div>
    <section class="growth-panel">
      <div class="growth-panel-head"><div><h2>Ciclos recentes</h2><p>Auditoria das execuções automáticas e manuais.</p></div></div>
      <div id="loopCycles" class="growth-empty">Carregando...</div>
    </section>`;
  main.append(panel);

  panel.querySelector('#loopRefresh')?.addEventListener('click', () => loadGrowthLoop().catch(showLoopError));
  panel.querySelector('#loopRunAll')?.addEventListener('click', () => runLoopAgent('run'));
  panel.querySelectorAll('[data-loop-agent]').forEach((item) => item.addEventListener('click', () => runLoopAgent(item.dataset.loopAgent)));
  panel.querySelector('#loopMetricForm')?.addEventListener('submit', saveMetrics);
  panel.querySelector('#loopResearchForm')?.addEventListener('submit', runResearch);
}

function showLoopError(error) {
  const status = document.querySelector('#loopStatus');
  if (status) { status.className = 'form-status error'; status.textContent = `Growth Loop: ${error?.message || 'falha inesperada'}`; }
}

async function runLoopAgent(agent) {
  const status = document.querySelector('#loopStatus');
  if (status) { status.className = 'form-status'; status.textContent = 'Executando…'; }
  try {
    const path = agent === 'run' ? '/api/growth-loop/run' : `/api/growth-loop/${agent}`;
    const result = await loopJson(path, {});
    if (status) { status.className = 'form-status success'; status.textContent = `Concluído • ${result.runId || result.cycleId || 'ok'}`; }
    await loadGrowthLoop();
  } catch (error) { showLoopError(error); }
}

async function saveMetrics(event) {
  event.preventDefault();
  const form = event.currentTarget; const raw = Object.fromEntries(new FormData(form).entries());
  const metrics = {};
  for (const key of ['impressions','engagements','clicks','leads','meetings','proposals']) metrics[key] = Number(raw[key] || 0);
  try {
    const result = await loopJson('/api/growth-loop/metrics', { contentItemId: raw.contentItemId, channel: raw.channel, metrics });
    const status = document.querySelector('#loopStatus');
    if (status) { status.className = 'form-status success'; status.textContent = `Content Score atualizado: ${result.contentScore}/100`; }
    await loadGrowthLoop();
  } catch (error) { showLoopError(error); }
}

async function runResearch(event) {
  event.preventDefault();
  const raw = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await loopJson('/api/growth-loop/research', raw);
    const status = document.querySelector('#loopStatus');
    if (status) { status.className = 'form-status success'; status.textContent = `Pesquisa criada para revisão • ${result.noteId || result.outputRef}`; }
  } catch (error) { showLoopError(error); }
}

async function loadGrowthLoop() {
  if (!loopToken() || !LOOP_API_BASE || LOOP_API_BASE.includes('example.invalid')) return;
  const [summary, cycles] = await Promise.all([
    loopRequest('/api/growth-loop/summary'),
    loopRequest('/api/growth-loop/cycles')
  ]);
  const t = summary.totals || {};
  const kpis = [
    ['Content Score', `${Math.round(Number(t.avg_content_score || 0))}/100`, 'média 30 dias'],
    ['Impressões', n(t.impressions), 'conteúdo mensurado'],
    ['Cliques', n(t.clicks), 'tráfego atribuído'],
    ['Leads', n(t.leads), 'conteúdo → aquisição'],
    ['Reuniões', n(t.meetings), 'sinal de oportunidade'],
    ['Receita atribuída', money(t.revenue), 'quando informada']
  ];
  document.querySelector('#loopKpis').innerHTML = kpis.map(([label,value,small]) => `<article class="growth-kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(small)}</small></article>`).join('');

  document.querySelector('#loopAttribution').innerHTML = summary.attribution?.length
    ? summary.attribution.map((item) => `<div style="display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid var(--line)"><span>${esc(item.source)}</span><strong>${n(item.leads)}</strong></div>`).join('')
    : '<div class="growth-empty">Aguardando leads com UTMs/sessão para formar atribuição.</div>';

  document.querySelector('#loopTopContent').innerHTML = (summary.top || []).map((item) => `<tr><td><strong>${esc(item.title)}</strong><br><small>${esc(item.pillar || '')}</small></td><td>${esc(item.channel)}</td><td><strong>${Math.round(Number(item.content_score || 0))}</strong></td><td>${n(item.impressions)}</td><td>${n(item.clicks)}</td><td>${n(item.leads)}</td></tr>`).join('') || '<tr><td colspan="6">Aguardando métricas.</td></tr>';

  document.querySelector('#loopCycles').innerHTML = cycles.cycles?.length
    ? cycles.cycles.map((cycle) => `<div style="display:grid;grid-template-columns:1fr auto auto;gap:16px;padding:12px 0;border-bottom:1px solid var(--line)"><div><strong>${esc(cycle.cycle_type)}</strong><br><small>${esc(cycle.trigger_type)}</small></div><span class="growth-badge">${esc(cycle.status)}</span><small>${dateTime(cycle.created_at)}</small></div>`).join('')
    : '<div class="growth-empty">Nenhum ciclo executado ainda.</div>';
}

installGrowthLoopView();
window.addEventListener('focus', () => {
  if (document.querySelector('[data-view-panel="growth-loop"]')?.classList.contains('active')) loadGrowthLoop().catch(() => {});
});
