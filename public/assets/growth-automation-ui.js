const API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
const TOKEN_KEY = 'vs_admin_token';
let initialized = false;
let objectUrls = [];

function token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token()}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function sendJson(path, method, body = {}) {
  return request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function ensureWorkspace() {
  if (document.querySelector('#automationWorkspace')) return;
  const contentView = document.querySelector('[data-view-panel="content"]');
  if (!contentView) return;
  contentView.insertAdjacentHTML('beforeend', `
    <section class="growth-panel" id="automationWorkspace">
      <div class="growth-panel-head">
        <div><h2>Automação Multicanal & Mídia</h2><p>Transforme um conteúdo-base em derivados e gere uma peça visual para revisão.</p></div>
        <span class="growth-badge">aprovação humana</span>
      </div>
      <div class="growth-two">
        <div>
          <div class="field"><label for="automationContentSelect">Conteúdo-base</label><select id="automationContentSelect"><option value="">Carregando...</option></select></div>
          <div class="growth-actions" style="margin-top:12px">
            <button class="growth-btn primary" id="repurposeContentButton" type="button">Gerar LinkedIn + Instagram + Newsletter</button>
            <button class="growth-btn" id="generateImageButton" type="button">Gerar imagem editorial</button>
          </div>
          <div class="form-status" id="automationStatus" aria-live="polite"></div>
        </div>
        <div>
          <strong style="display:block;margin-bottom:8px">Regras desta automação</strong>
          <p class="muted">Os derivados entram como <b>draft</b>. As imagens entram como <b>review</b>. Nenhum canal externo é publicado automaticamente nesta fase.</p>
        </div>
      </div>
    </section>
    <section class="growth-panel" id="mediaWorkspace">
      <div class="growth-panel-head"><div><h2>Biblioteca de Mídia</h2><p>Imagens privadas em R2, com aprovação ou rejeição antes de uso.</p></div><button class="growth-btn" id="refreshMediaButton" type="button">Atualizar</button></div>
      <div id="mediaLibrary" class="growth-empty">Carregando biblioteca...</div>
    </section>
  `);

  document.querySelector('#repurposeContentButton')?.addEventListener('click', repurposeSelected);
  document.querySelector('#generateImageButton')?.addEventListener('click', generateImageForSelected);
  document.querySelector('#refreshMediaButton')?.addEventListener('click', loadMedia);
  document.querySelector('#mediaLibrary')?.addEventListener('click', mediaAction);
}

async function loadContentOptions() {
  const select = document.querySelector('#automationContentSelect');
  if (!select) return;
  try {
    const data = await request('/api/growth/content?limit=200');
    const rows = (data.content || []).filter((item) => String(item.body || '').trim());
    select.innerHTML = rows.length
      ? `<option value="">Selecione...</option>${rows.map((item) => `<option value="${escapeHtml(item.id)}">[${escapeHtml(item.channel)} / ${escapeHtml(item.status)}] ${escapeHtml(item.title)}</option>`).join('')}`
      : '<option value="">Nenhum conteúdo com texto disponível</option>';
  } catch (error) {
    select.innerHTML = '<option value="">Growth API indisponível</option>';
  }
}

function selectedContentId() {
  return document.querySelector('#automationContentSelect')?.value || '';
}

async function repurposeSelected() {
  const id = selectedContentId();
  const status = document.querySelector('#automationStatus');
  if (!id) { status.textContent = 'Selecione um conteúdo-base.'; status.className = 'form-status error'; return; }
  const button = document.querySelector('#repurposeContentButton');
  button.disabled = true;
  status.textContent = 'Gerando versões específicas para cada canal...';
  status.className = 'form-status';
  try {
    const result = await sendJson(`/api/growth/content/${id}/repurpose`, 'POST');
    status.textContent = `${result.variants?.length || 0} rascunhos criados. Revise no pipeline editorial antes de aprovar.`;
    status.className = 'form-status success';
    await loadContentOptions();
  } catch (error) {
    status.textContent = `Não foi possível reaproveitar: ${error.message}`;
    status.className = 'form-status error';
  } finally { button.disabled = false; }
}

async function generateImageForSelected() {
  const id = selectedContentId();
  const status = document.querySelector('#automationStatus');
  if (!id) { status.textContent = 'Selecione um conteúdo-base.'; status.className = 'form-status error'; return; }
  const button = document.querySelector('#generateImageButton');
  button.disabled = true;
  status.textContent = 'Gerando imagem editorial e armazenando no R2...';
  status.className = 'form-status';
  try {
    const result = await sendJson('/api/growth/media/generate', 'POST', { contentId: id });
    status.textContent = `Imagem ${result.asset?.id || ''} criada para revisão.`;
    status.className = 'form-status success';
    await loadMedia();
  } catch (error) {
    status.textContent = error.message === 'r2_binding_not_configured'
      ? 'R2 ainda não está ativo neste ambiente. O restante do Growth OS continua funcional.'
      : `Falha na imagem: ${error.message}`;
    status.className = 'form-status error';
  } finally { button.disabled = false; }
}

async function privateImageUrl(asset) {
  if (!asset.public_url) return '';
  try {
    const response = await fetch(`${API_BASE}${asset.public_url}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!response.ok) return '';
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    return url;
  } catch { return ''; }
}

async function loadMedia() {
  const target = document.querySelector('#mediaLibrary');
  if (!target) return;
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
  target.className = 'growth-empty';
  target.textContent = 'Carregando biblioteca...';
  try {
    const data = await request('/api/growth/media');
    const assets = data.assets || [];
    if (!assets.length) { target.textContent = 'Nenhuma imagem gerada ainda.'; return; }
    const cards = await Promise.all(assets.slice(0, 24).map(async (asset) => {
      const imageUrl = asset.asset_type === 'image' ? await privateImageUrl(asset) : '';
      return `<article class="channel-card" style="overflow:hidden">
        ${imageUrl ? `<img src="${imageUrl}" alt="${escapeHtml(asset.alt_text || asset.title || '')}" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;margin-bottom:12px">` : '<div class="growth-empty" style="margin-bottom:12px">Arquivo privado indisponível</div>'}
        <strong>${escapeHtml(asset.title || 'Mídia')}</strong>
        <span>${new Date(asset.created_at).toLocaleDateString('pt-BR')}</span>
        <span class="status ${asset.status === 'approved' ? 'ready' : 'pending'}">${escapeHtml(asset.status)}</span>
        <div class="growth-actions" style="margin-top:10px">
          <button class="growth-btn" data-media-id="${escapeHtml(asset.id)}" data-media-status="approved" type="button">Aprovar</button>
          <button class="growth-btn" data-media-id="${escapeHtml(asset.id)}" data-media-status="rejected" type="button">Rejeitar</button>
        </div>
      </article>`;
    }));
    target.className = 'channel-grid';
    target.innerHTML = cards.join('');
  } catch (error) {
    target.className = 'growth-empty';
    target.textContent = error.status === 500 ? 'Migration de mídia ainda não aplicada neste ambiente.' : 'Biblioteca indisponível neste ambiente.';
  }
}

async function mediaAction(event) {
  const button = event.target.closest('[data-media-id][data-media-status]');
  if (!button) return;
  button.disabled = true;
  try {
    await sendJson(`/api/growth/media/${button.dataset.mediaId}`, 'PATCH', { status: button.dataset.mediaStatus });
    await loadMedia();
  } catch (error) {
    window.alert(`Não foi possível atualizar a mídia: ${error.message}`);
  } finally { button.disabled = false; }
}

async function init() {
  if (initialized || !token()) return;
  initialized = true;
  ensureWorkspace();
  await Promise.allSettled([loadContentOptions(), loadMedia()]);
}

const panel = document.querySelector('#panelView');
if (panel) {
  new MutationObserver(() => {
    if (!panel.classList.contains('panel-hidden') && token()) init();
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
}
if (token()) init();
