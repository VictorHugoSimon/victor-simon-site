const INTAKE_API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
const INTAKE_TOKEN_KEY = 'vs_admin_token';

function intakeEscape(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

async function intakeRequest(path, options = {}) {
  const response = await fetch(`${INTAKE_API_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${sessionStorage.getItem(INTAKE_TOKEN_KEY) || ''}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
  return data;
}

function parseTargetLine(line, defaults) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const delimiter = trimmed.includes('|') ? '|' : trimmed.includes('\t') ? '\t' : ';';
  const [name, website = '', industry = '', region = '', score = ''] = trimmed.split(delimiter).map((item) => item.trim());
  if (!name) return null;
  return {
    name,
    website,
    industry: industry || defaults.industry,
    region: region || defaults.region,
    icpScore: score ? Number(score) : defaults.defaultIcpScore,
    offerKey: defaults.offerKey
  };
}

function ensureIntakeWorkspace() {
  const view = document.querySelector('[data-view-panel="prospecting"]');
  if (!view || document.querySelector('#prospectingIntakeSection')) return;
  const reference = view.querySelector('.compliance-panel') || view.children[1];
  const html = `
    <section class="growth-panel" id="prospectingIntakeSection">
      <div class="growth-panel-head">
        <div><h2>Campanhas ICP & Entrada de Alvos</h2><p>Carregue empresas reais para alimentar a fila dos agentes de pesquisa e qualificação.</p></div>
        <span class="growth-badge status ready">fontes públicas · sem outbound</span>
      </div>
      <div class="growth-two">
        <form id="prospectingIntakeForm" class="channel-card">
          <strong>Nova campanha</strong>
          <span>Crie a campanha e cole até 100 empresas por carga.</span>
          <div class="field" style="margin-top:12px"><label for="intakeCampaignName">Nome da campanha</label><input id="intakeCampaignName" required placeholder="Ex.: PMO para empresas de tecnologia SP"></div>
          <div class="form-grid" style="margin-top:10px">
            <div class="field"><label for="intakeOffer">Oferta</label><select id="intakeOffer"><option value="diagnostico-executivo">Diagnóstico Executivo</option><option value="sprint-produto-delivery">Sprint Produto & Delivery</option><option value="automacao-dados-ia">Automação, Dados & IA</option><option value="solucao-personalizada">Solução personalizada</option></select></div>
            <div class="field"><label for="intakeScore">Score ICP padrão</label><input id="intakeScore" type="number" min="0" max="100" value="70"></div>
            <div class="field"><label for="intakeIndustry">Setor padrão</label><input id="intakeIndustry" placeholder="Tecnologia, Agro, Varejo..."></div>
            <div class="field"><label for="intakeRegion">Região padrão</label><input id="intakeRegion" placeholder="São Paulo, Brasil..."></div>
          </div>
          <div class="field" style="margin-top:10px">
            <label for="intakeTargets">Empresas — uma por linha</label>
            <textarea id="intakeTargets" required rows="9" placeholder="Empresa | site.com.br | setor | região | score\nEmpresa 2 | empresa2.com.br"></textarea>
          </div>
          <small class="muted">Formato: Nome | site | setor | região | score. Só o nome é obrigatório. Sites ajudam a deduplicar.</small>
          <div class="growth-actions" style="margin-top:12px"><button class="growth-btn primary" id="intakeSubmit" type="submit">Criar campanha e fila</button></div>
          <div class="form-status" id="intakeStatus" aria-live="polite"></div>
        </form>
        <section class="channel-card">
          <strong>Campanhas recentes</strong>
          <span>Visão rápida da fila de pesquisa.</span>
          <div id="intakeCampaigns" class="growth-empty" style="margin-top:12px">Carregando campanhas...</div>
        </section>
      </div>
    </section>`;
  if (reference) reference.insertAdjacentHTML('beforebegin', html); else view.insertAdjacentHTML('afterbegin', html);
  document.querySelector('#prospectingIntakeForm')?.addEventListener('submit', submitIntakeCampaign);
}

function renderIntakeCampaigns(rows) {
  const target = document.querySelector('#intakeCampaigns');
  if (!target) return;
  if (!rows.length) {
    target.className = 'growth-empty';
    target.textContent = 'Nenhuma campanha criada ainda.';
    return;
  }
  target.className = '';
  target.innerHTML = rows.slice(0, 10).map((campaign) => `<div class="recommendation" style="margin-bottom:8px">
    <span class="recommendation-rank">${Number(campaign.default_icp_score || 0)}</span>
    <div><strong>${intakeEscape(campaign.name)}</strong><p>${intakeEscape(campaign.industry || 'Todos os setores')} · ${intakeEscape(campaign.region || 'Todas as regiões')}</p></div>
    <span class="growth-badge">${Number(campaign.target_count || 0)} alvos · ${Number(campaign.queued_count || 0)} na fila</span>
  </div>`).join('');
}

async function loadIntakeCampaigns() {
  if (!sessionStorage.getItem(INTAKE_TOKEN_KEY)) return;
  ensureIntakeWorkspace();
  const target = document.querySelector('#intakeCampaigns');
  try {
    const data = await intakeRequest('/api/prospecting-intake/campaigns');
    renderIntakeCampaigns(data.campaigns || []);
  } catch (error) {
    if (target) { target.className = 'growth-empty'; target.textContent = `Campanhas indisponíveis: ${error.message}`; }
  }
}

async function submitIntakeCampaign(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.querySelector('#intakeSubmit');
  const status = document.querySelector('#intakeStatus');
  const defaults = {
    offerKey: document.querySelector('#intakeOffer').value,
    defaultIcpScore: Number(document.querySelector('#intakeScore').value || 70),
    industry: document.querySelector('#intakeIndustry').value.trim(),
    region: document.querySelector('#intakeRegion').value.trim()
  };
  const targets = document.querySelector('#intakeTargets').value.split(/\r?\n/).map((line) => parseTargetLine(line, defaults)).filter(Boolean).slice(0, 100);
  if (!targets.length) { status.textContent = 'Inclua pelo menos uma empresa válida.'; return; }
  button.disabled = true;
  status.className = 'form-status';
  status.textContent = `Preparando ${targets.length} empresas...`;
  try {
    const campaign = await intakeRequest('/api/prospecting-intake/campaigns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        name: document.querySelector('#intakeCampaignName').value,
        ...defaults,
        goals: { targetCount: targets.length, objective: 'generate_qualified_opportunities' }
      })
    });
    const result = await intakeRequest(`/api/prospecting-intake/campaigns/${campaign.id}/targets/bulk`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targets })
    });
    status.className = 'form-status success';
    status.textContent = `${result.totalAccepted} empresas colocadas na fila: ${result.created.length} novas, ${result.reused.length} reaproveitadas, ${result.skipped.length} ignoradas.`;
    form.reset();
    document.querySelector('#intakeScore').value = '70';
    await loadIntakeCampaigns();
    if (typeof window.loadProspectingWorkspace === 'function') await window.loadProspectingWorkspace();
  } catch (error) {
    status.className = 'form-status error';
    status.textContent = `Não foi possível criar a campanha: ${error.message}`;
  } finally { button.disabled = false; }
}

function intakeBoot() {
  ensureIntakeWorkspace();
  loadIntakeCampaigns();
}

document.addEventListener('DOMContentLoaded', intakeBoot);
window.addEventListener('focus', () => { if (document.querySelector('[data-view-panel="prospecting"].active')) loadIntakeCampaigns(); });