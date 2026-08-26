const SOCIAL_API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
const SOCIAL_TOKEN_KEY = 'vs_admin_token';

function socialToken() { return sessionStorage.getItem(SOCIAL_TOKEN_KEY) || ''; }
function socialEscape(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function socialDate(value) { return value ? new Date(value).toLocaleString('pt-BR') : '—'; }

async function socialRequest(path, options = {}) {
  const response = await fetch(`${SOCIAL_API_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${socialToken()}`, ...(options.headers || {}) }
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
async function socialJson(path, body = {}) {
  return socialRequest(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function ensureSocialWorkspace() {
  const panel = document.querySelector('[data-view-panel="channels"]');
  if (!panel || document.querySelector('#officialSocialWorkspace')) return;
  const section = document.createElement('section');
  section.id = 'officialSocialWorkspace';
  section.className = 'growth-panel';
  section.innerHTML = `
    <div class="growth-panel-head"><div><h2>Conectores oficiais</h2><p>OAuth, publicação aprovada e estado das credenciais. Tokens nunca aparecem no navegador.</p></div><button class="growth-btn" id="refreshSocialButton" type="button">Atualizar</button></div>
    <div class="channel-grid" id="socialConnectorCards"><div class="growth-empty">Carregando conectores...</div></div>
    <div id="socialWorkspaceStatus" class="form-status" aria-live="polite"></div>
  `;
  panel.appendChild(section);

  const publish = document.createElement('section');
  publish.className = 'growth-panel';
  publish.innerHTML = `
    <div class="growth-panel-head"><div><h2>Fila aprovada para redes</h2><p>Publicação continua manual até concluirmos a homologação e as métricas.</p></div></div>
    <div id="approvedSocialContent" class="growth-empty">Carregando conteúdos aprovados...</div>
  `;
  panel.appendChild(publish);
  document.querySelector('#refreshSocialButton')?.addEventListener('click', loadSocialWorkspace);
}

function providerCard(provider, configured, account) {
  const connected = account?.status === 'connected';
  const label = provider === 'linkedin' ? 'LinkedIn' : 'Instagram';
  const description = provider === 'linkedin'
    ? 'OAuth 3-legged + Posts API para publicação no perfil profissional.'
    : 'Instagram Login para conta profissional + Content Publishing API.';
  let status = connected ? 'conectado' : configured ? 'pronto para conectar' : 'app/secret pendente';
  let actions = '';
  if (connected) {
    actions = `<button class="growth-btn" data-social-disconnect="${socialEscape(account.id)}" type="button">Desconectar</button>`;
  } else if (configured) {
    actions = `<button class="growth-btn primary" data-social-connect="${provider}" type="button">Conectar ${label}</button>`;
  } else {
    actions = `<button class="growth-btn" type="button" disabled>Configuração pendente</button>`;
  }
  return `<article class="channel-card"><strong>${label}</strong><span>${description}</span><span class="status ${connected ? 'ready' : 'pending'}">${status}</span>${account ? `<small>${socialEscape(account.accountName)} · token até ${socialEscape(socialDate(account.expiresAt))}</small>` : ''}<div style="margin-top:10px">${actions}</div></article>`;
}

async function connectProvider(provider) {
  const status = document.querySelector('#socialWorkspaceStatus');
  status.className = 'form-status'; status.textContent = `Preparando OAuth do ${provider}…`;
  try {
    const data = await socialJson(`/api/social/${provider}/connect`);
    const popup = window.open(data.authorizationUrl, `oauth-${provider}`, 'popup,width=720,height=780');
    if (!popup) throw new Error('POPUP_BLOCKED');
    status.textContent = 'Conclua a autorização na janela aberta. O painel atualizará automaticamente.';
  } catch (error) {
    status.className = 'form-status error';
    status.textContent = error.message === 'linkedin_not_configured' || error.message === 'instagram_not_configured'
      ? 'O app OAuth ainda precisa das credenciais no Worker.'
      : `Não foi possível iniciar OAuth: ${error.message}`;
  }
}

async function disconnectAccount(accountId) {
  if (!window.confirm('Desconectar esta conta e apagar o token criptografado?')) return;
  try {
    await socialJson(`/api/social/accounts/${encodeURIComponent(accountId)}/disconnect`);
    await loadSocialWorkspace();
  } catch (error) { window.alert(`Falha ao desconectar: ${error.message}`); }
}

function approvedCard(item) {
  const publishLabel = item.channel === 'instagram' ? 'Publicar no Instagram' : 'Publicar no LinkedIn';
  return `<article style="border:1px solid #e4e7ec;border-radius:14px;padding:14px;margin-bottom:10px;background:#fff"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap"><div><span class="growth-badge">${socialEscape(item.channel)}</span><strong style="display:block;margin:8px 0 4px">${socialEscape(item.title)}</strong><small style="color:#667085">${socialEscape(item.pillar || '')}</small></div><button class="growth-btn primary" data-social-publish="${socialEscape(item.channel)}" data-content-id="${socialEscape(item.id)}" type="button">${publishLabel}</button></div></article>`;
}

async function publishApproved(button) {
  const channel = button.dataset.socialPublish;
  const contentId = button.dataset.contentId;
  const status = document.querySelector('#socialWorkspaceStatus');
  button.disabled = true;
  status.className = 'form-status'; status.textContent = `Publicando no ${channel}…`;
  try {
    const data = await socialJson(`/api/social/${channel}/publish`, { contentId });
    status.className = 'form-status success';
    status.textContent = data.status === 'processing'
      ? 'O Instagram criou o container e está processando a mídia; uma nova tentativa poderá ser necessária.'
      : `Publicado com sucesso no ${channel}.`;
    await loadSocialWorkspace();
  } catch (error) {
    const messages = {
      approved_image_required: 'O Instagram exige uma imagem aprovada vinculada a este conteúdo.',
      instagram_not_connected: 'Conecte o Instagram antes de publicar.',
      linkedin_not_connected: 'Conecte o LinkedIn antes de publicar.',
      instagram_token_expired: 'O token do Instagram expirou. Renove a conexão.',
      linkedin_token_expired: 'O token do LinkedIn expirou. Reconecte a conta.'
    };
    status.className = 'form-status error';
    status.textContent = messages[error.message] || `Falha ao publicar: ${error.message}`;
  } finally { button.disabled = false; }
}

async function loadApprovedSocialContent() {
  const target = document.querySelector('#approvedSocialContent');
  if (!target || !socialToken()) return;
  try {
    const [linkedin, instagram] = await Promise.all([
      socialRequest('/api/growth/content?status=approved&channel=linkedin&limit=50'),
      socialRequest('/api/growth/content?status=approved&channel=instagram&limit=50')
    ]);
    const items = [...(linkedin.content || []), ...(instagram.content || [])];
    target.className = items.length ? '' : 'growth-empty';
    target.innerHTML = items.length ? items.map(approvedCard).join('') : 'Nenhum conteúdo social aprovado aguardando publicação.';
  } catch (error) {
    target.className = 'growth-empty'; target.textContent = `Fila social indisponível: ${error.message}`;
  }
}

async function loadSocialWorkspace() {
  ensureSocialWorkspace();
  const cards = document.querySelector('#socialConnectorCards');
  if (!cards || !socialToken() || !SOCIAL_API_BASE || SOCIAL_API_BASE.includes('example.invalid')) return;
  try {
    const data = await socialRequest('/api/social/status');
    const linkedin = (data.accounts || []).find((item) => item.channel === 'linkedin' && item.status === 'connected');
    const instagram = (data.accounts || []).find((item) => item.channel === 'instagram' && item.status === 'connected');
    cards.innerHTML = providerCard('linkedin', data.configured?.linkedin, linkedin) + providerCard('instagram', data.configured?.instagram, instagram);
    await loadApprovedSocialContent();
  } catch (error) {
    cards.innerHTML = `<div class="growth-empty">Conectores sociais aguardando migration/configuração: ${socialEscape(error.message)}</div>`;
  }
}

document.addEventListener('click', (event) => {
  const connect = event.target.closest('[data-social-connect]');
  if (connect) connectProvider(connect.dataset.socialConnect);
  const disconnect = event.target.closest('[data-social-disconnect]');
  if (disconnect) disconnectAccount(disconnect.dataset.socialDisconnect);
  const publish = event.target.closest('[data-social-publish]');
  if (publish) publishApproved(publish);
});

window.addEventListener('message', (event) => {
  if (event.data?.type === 'social-oauth') loadSocialWorkspace();
});

document.addEventListener('DOMContentLoaded', () => {
  ensureSocialWorkspace();
  if (socialToken()) loadSocialWorkspace();
});

setTimeout(() => { if (socialToken()) loadSocialWorkspace(); }, 800);
