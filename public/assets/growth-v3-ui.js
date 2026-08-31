const API_BASE_V3 = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
const TOKEN_KEY_V3 = 'vs_admin_token';

function escapeV3(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function moneyV3(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value || 0));
}
function groupCount(rows = [], status) {
  return Number(rows.find((row) => row.status === status)?.total || 0);
}
async function getV3(path) {
  const response = await fetch(`${API_BASE_V3}${path}`, {
    headers: { Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY_V3) || ''}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
  return data;
}

function ensureGrowthV3Workspace() {
  const view = document.querySelector('[data-view-panel="prospecting"]');
  if (!view || document.querySelector('#growthV3PrioritySection')) return;
  const compliance = view.querySelector('.compliance-panel');
  const anchor = compliance || view.querySelector('#prospectingKpis');
  if (!anchor) return;
  anchor.insertAdjacentHTML('afterend', `
    <section class="growth-panel" id="growthV3PrioritySection">
      <div class="growth-panel-head">
        <div>
          <h2>Quem Victor deve contatar agora</h2>
          <p>Prioridade comercial combinando score, intenção, autoridade, canal disponível e evidências públicas.</p>
        </div>
        <span class="growth-badge status ready">Priority Score V3</span>
      </div>
      <div class="growth-grid" id="growthV3Telemetry">
        <article class="growth-kpi"><span>Growth OS V3</span><strong>—</strong><small>carregando</small></article>
      </div>
      <div class="table-wrap" style="margin-top:16px">
        <table class="growth-table">
          <thead><tr><th>Prioridade</th><th>Decisor</th><th>Empresa</th><th>Score</th><th>Sinal</th><th>Próxima ação</th></tr></thead>
          <tbody id="growthV3PriorityRows"></tbody>
        </table>
        <div class="growth-empty" id="growthV3PriorityEmpty">Carregando prioridades...</div>
      </div>
    </section>
    <section class="growth-panel" id="growthV3WhatsappSection">
      <div class="growth-panel-head">
        <div><h2>Alertas do Growth OS no WhatsApp</h2><p>Novo lead, decisor verificado, qualificação, hot lead, draft e ações comerciais do painel.</p></div>
        <span class="growth-badge" id="growthV3WhatsappBadge">verificando</span>
      </div>
      <div id="growthV3WhatsappStatus" class="growth-empty">Carregando configuração...</div>
    </section>
  `);
}

function priorityBadge(item) {
  if (item.qualification === 'hot') return '<span class="growth-badge status ready">HOT</span>';
  if (item.qualification === 'priority') return '<span class="growth-badge status pending">PRIORIDADE</span>';
  return '<span class="growth-badge">QUALIFICADO</span>';
}

function renderPriorityQueue(rows = []) {
  const body = document.querySelector('#growthV3PriorityRows');
  const empty = document.querySelector('#growthV3PriorityEmpty');
  if (!body || !empty) return;
  body.innerHTML = rows.map((item) => `<tr>
    <td><strong style="font-size:1.05rem">${Number(item.priorityScore || 0)}</strong><br>${priorityBadge(item)}</td>
    <td><strong>${escapeV3(item.name)}</strong><br><span class="muted">${escapeV3(item.role || '—')}</span></td>
    <td>${escapeV3(item.account_name || '—')}<br><span class="muted">${escapeV3(item.offer_key || '—')}</span></td>
    <td>${Number(item.score || 0)}<br><span class="muted">intenção ${Number(item.intent || 0)} · autoridade ${Number(item.authority || 0)}</span></td>
    <td>${escapeV3(item.signal_description || 'Sem sinal detalhado')} ${item.evidence_url ? `<br><a href="${escapeV3(item.evidence_url)}" target="_blank" rel="noopener">ver evidência</a>` : ''}</td>
    <td><strong>${escapeV3(item.nextAction)}</strong><br><span class="muted">${item.channelReady ? 'canal público disponível' : 'canal direto pendente'}</span></td>
  </tr>`).join('');
  empty.style.display = rows.length ? 'none' : 'block';
  if (!rows.length) empty.textContent = 'Ainda não há contatos com score mínimo de 65.';
}

function renderTelemetry(data = {}) {
  const target = document.querySelector('#growthV3Telemetry');
  if (!target) return;
  const notificationPending = groupCount(data.notifications, 'queued') + groupCount(data.notifications, 'retry');
  target.innerHTML = [
    ['Contatos qualificados', data.qualified || 0, 'score ≥ 65'],
    ['Leads quentes', data.hot || 0, 'score ≥ 80'],
    ['Drafts aguardando', data.draftsPending || 0, 'aprovação humana'],
    ['Oportunidades', data.opportunities || 0, moneyV3(data.pipelineValue)],
    ['Tarefas abertas', data.openTasks || 0, 'próximas ações'],
    ['Alertas pendentes', notificationPending, data.whatsapp?.configured ? 'WhatsApp conectado' : 'aguardando credencial']
  ].map(([label, value, note]) => `<article class="growth-kpi"><span>${escapeV3(label)}</span><strong>${escapeV3(value)}</strong><small>${escapeV3(note)}</small></article>`).join('');

  const badge = document.querySelector('#growthV3WhatsappBadge');
  const status = document.querySelector('#growthV3WhatsappStatus');
  if (!badge || !status) return;
  if (data.whatsapp?.configured) {
    badge.textContent = 'WhatsApp conectado';
    badge.className = 'growth-badge status ready';
    status.className = 'channel-card';
    status.innerHTML = `<strong>Alertas automáticos ativos</strong><span>Provider: Meta WhatsApp Cloud API · template ${escapeV3(data.whatsapp.template || 'configurado')} · idioma ${escapeV3(data.whatsapp.language || 'pt_BR')}.</span><span>O número de destino fica protegido como secret e não aparece no painel nem no repositório.</span>`;
  } else {
    badge.textContent = 'aguardando conexão';
    badge.className = 'growth-badge status pending';
    status.className = 'channel-card';
    status.innerHTML = `<strong>Fila de alertas já está ativa</strong><span>Os eventos são registrados e deduplicados. Para o envio chegar no WhatsApp, faltam as credenciais oficiais da Meta e o template de notificação.</span><span>Nenhum telefone é gravado no código público.</span>`;
  }
}

async function loadGrowthV3Workspace() {
  ensureGrowthV3Workspace();
  if (!sessionStorage.getItem(TOKEN_KEY_V3)) return;
  try {
    const [queue, telemetry] = await Promise.all([
      getV3('/api/growth-v3/action-queue'),
      getV3('/api/growth-v3/telemetry')
    ]);
    renderPriorityQueue(queue.contacts || []);
    renderTelemetry(telemetry || {});
  } catch (error) {
    const empty = document.querySelector('#growthV3PriorityEmpty');
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = `Growth OS V3 indisponível: ${error.message}`;
    }
  }
}

ensureGrowthV3Workspace();
const originalProspectingLoader = window.loadProspectingWorkspace;
if (typeof originalProspectingLoader === 'function') {
  window.loadProspectingWorkspace = async (...args) => {
    const result = await originalProspectingLoader(...args);
    await loadGrowthV3Workspace();
    return result;
  };
}
document.querySelector('[data-view="prospecting"]')?.addEventListener('click', () => setTimeout(loadGrowthV3Workspace, 0));
window.loadGrowthV3Workspace = loadGrowthV3Workspace;
