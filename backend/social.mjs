import { bearerToken, id, json, normalizeText, parseJson, sha256, verifyToken } from './lib.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const LINKEDIN_SCOPES = ['openid', 'profile', 'w_member_social'];
const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];

function clean(value, max = 500) { return normalizeText(value, max); }
function nowIso() { return new Date().toISOString(); }
function expiresIso(seconds) { return new Date(Date.now() + Math.max(0, Number(seconds || 0)) * 1000).toISOString(); }
function parseJsonValue(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }

async function isAdmin(request, env) {
  return Boolean(await verifyToken(bearerToken(request), env.AUTH_SECRET));
}
async function requireAdmin(request, env) {
  return (await isAdmin(request, env)) ? null : json({ error: 'unauthorized' }, { status: 401 });
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64UrlToBytes(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function randomSecret(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64Url(value);
}

async function encryptionKey(secret) {
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET_INVALID');
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(`${secret}:social-credentials:v1`));
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function encryptSecret(secret, plaintext) {
  if (!plaintext) return null;
  const iv = new Uint8Array(12); crypto.getRandomValues(iv);
  const key = await encryptionKey(secret);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(String(plaintext))));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`;
}
async function decryptSecret(secret, encrypted) {
  if (!encrypted) return '';
  const [version, ivValue, cipherValue] = String(encrypted).split('.');
  if (version !== 'v1' || !ivValue || !cipherValue) throw new Error('CREDENTIAL_FORMAT_INVALID');
  const key = await encryptionKey(secret);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlToBytes(ivValue) }, key, base64UrlToBytes(cipherValue));
  return decoder.decode(plaintext);
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
async function signedMediaUrl(request, env, assetId, ttlSeconds = 900) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${assetId}:${exp}`;
  const sig = bytesToBase64Url(await hmac(env.AUTH_SECRET, payload));
  const origin = env.PUBLIC_API_BASE || new URL(request.url).origin;
  return `${String(origin).replace(/\/+$/, '')}/api/social/media/${encodeURIComponent(assetId)}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
}
async function verifyMediaSignature(env, assetId, exp, sig) {
  const expiry = Number(exp || 0);
  if (!expiry || expiry < Math.floor(Date.now() / 1000) || expiry > Math.floor(Date.now() / 1000) + 3600) return false;
  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(env.AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('HMAC', key, base64UrlToBytes(sig), encoder.encode(`${assetId}:${expiry}`));
  } catch { return false; }
}

function callbackBase(request, env) {
  return String(env.SOCIAL_CALLBACK_BASE || env.PUBLIC_API_BASE || new URL(request.url).origin).replace(/\/+$/, '');
}
function callbackUri(request, env, provider) {
  return `${callbackBase(request, env)}/api/social/${provider}/callback`;
}

async function saveOAuthState(env, provider, state, redirectUri, returnUrl = '') {
  const stateId = id('oauth');
  const hash = await sha256(state);
  await env.DB.prepare(`
    INSERT INTO oauth_states (id, provider, state_hash, redirect_uri, return_url, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(stateId, provider, hash, redirectUri, clean(returnUrl, 600), expiresIso(600)).run();
}
async function consumeOAuthState(env, provider, state) {
  const hash = await sha256(state || '');
  const row = await env.DB.prepare(`
    SELECT * FROM oauth_states WHERE provider = ? AND state_hash = ? AND consumed_at IS NULL AND expires_at > ? LIMIT 1
  `).bind(provider, hash, nowIso()).first();
  if (!row) return null;
  await env.DB.prepare('UPDATE oauth_states SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?').bind(row.id).run();
  return row;
}

function oauthHtml(ok, provider, message) {
  const title = ok ? `${provider} conectado` : `Falha ao conectar ${provider}`;
  const safe = String(message || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui;padding:40px;max-width:680px;margin:auto"><h1>${title}</h1><p>${safe}</p><p>Você pode fechar esta janela e voltar ao Growth OS.</p><script>setTimeout(()=>{try{window.opener?.postMessage({type:'social-oauth',provider:${JSON.stringify(provider)},ok:${ok}},'*')}catch{}},200)</script></body></html>`, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function upsertSocialAccount(env, { channel, accountName, externalAccountId, capabilities, token, refreshToken, tokenType, scopes, expiresAt, metadata }) {
  let account = await env.DB.prepare('SELECT id FROM social_accounts WHERE channel = ? AND external_account_id = ? LIMIT 1').bind(channel, externalAccountId).first();
  const accountId = account?.id || id('social');
  if (account) {
    await env.DB.prepare(`UPDATE social_accounts SET account_name = ?, status = 'connected', capabilities_json = ?, last_sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(clean(accountName, 180), JSON.stringify(capabilities || {}), accountId).run();
  } else {
    await env.DB.prepare(`INSERT INTO social_accounts (id, channel, account_name, external_account_id, status, capabilities_json, last_sync_at) VALUES (?, ?, ?, ?, 'connected', ?, CURRENT_TIMESTAMP)`)
      .bind(accountId, channel, clean(accountName, 180), clean(externalAccountId, 240), JSON.stringify(capabilities || {})).run();
  }
  const encryptedAccess = await encryptSecret(env.AUTH_SECRET, token);
  const encryptedRefresh = await encryptSecret(env.AUTH_SECRET, refreshToken || '');
  const credentialId = id('credential');
  await env.DB.prepare(`
    INSERT INTO social_credentials (id, social_account_id, provider, access_token_enc, refresh_token_enc, token_type, scopes_json, expires_at, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(social_account_id) DO UPDATE SET
      provider = excluded.provider,
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = excluded.refresh_token_enc,
      token_type = excluded.token_type,
      scopes_json = excluded.scopes_json,
      expires_at = excluded.expires_at,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `).bind(credentialId, accountId, channel, encryptedAccess, encryptedRefresh, clean(tokenType || 'Bearer', 40), JSON.stringify(scopes || []), expiresAt || null, JSON.stringify(metadata || {})).run();
  return accountId;
}

async function socialStatus(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const result = await env.DB.prepare(`
    SELECT a.id, a.channel, a.account_name, a.external_account_id, a.status, a.capabilities_json, a.last_sync_at,
           c.expires_at, c.scopes_json
    FROM social_accounts a LEFT JOIN social_credentials c ON c.social_account_id = a.id
    ORDER BY a.channel, a.account_name
  `).all();
  return json({
    configured: {
      linkedin: Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET),
      instagram: Boolean(env.INSTAGRAM_CLIENT_ID && env.INSTAGRAM_CLIENT_SECRET)
    },
    accounts: result.results.map((row) => ({
      id: row.id, channel: row.channel, accountName: row.account_name, externalAccountId: row.external_account_id,
      status: row.status, capabilities: parseJsonValue(row.capabilities_json), scopes: parseJsonValue(row.scopes_json, []),
      expiresAt: row.expires_at, lastSyncAt: row.last_sync_at
    }))
  });
}

async function startLinkedIn(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) return json({ error: 'linkedin_not_configured' }, { status: 503 });
  const state = randomSecret();
  const redirectUri = callbackUri(request, env, 'linkedin');
  await saveOAuthState(env, 'linkedin', state, redirectUri, '/painel.html');
  const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.LINKEDIN_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', LINKEDIN_SCOPES.join(' '));
  return json({ authorizationUrl: url.toString(), redirectUri, scopes: LINKEDIN_SCOPES });
}

async function linkedinCallback(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return oauthHtml(false, 'LinkedIn', clean(url.searchParams.get('error_description') || url.searchParams.get('error'), 500));
  const code = clean(url.searchParams.get('code'), 2000);
  const state = clean(url.searchParams.get('state'), 500);
  const saved = await consumeOAuthState(env, 'linkedin', state);
  if (!code || !saved) return oauthHtml(false, 'LinkedIn', 'Código ou state inválido/expirado.');
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) return oauthHtml(false, 'LinkedIn', 'Aplicação LinkedIn ainda não configurada no Worker.');
  try {
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: saved.redirect_uri, client_id: env.LINKEDIN_CLIENT_ID, client_secret: env.LINKEDIN_CLIENT_SECRET });
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(`TOKEN_EXCHANGE_${tokenResponse.status}`);
    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const profile = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok || !profile.sub) throw new Error(`PROFILE_${profileResponse.status}`);
    await upsertSocialAccount(env, {
      channel: 'linkedin', accountName: profile.name || profile.preferred_username || `LinkedIn ${String(profile.sub).slice(-8)}`,
      externalAccountId: String(profile.sub), capabilities: { publishText: true, publishImage: false, metrics: false },
      token: tokenData.access_token, refreshToken: tokenData.refresh_token, tokenType: tokenData.token_type,
      scopes: LINKEDIN_SCOPES, expiresAt: tokenData.expires_in ? expiresIso(tokenData.expires_in) : null,
      metadata: { picture: profile.picture || null, locale: profile.locale || null }
    });
    return oauthHtml(true, 'LinkedIn', 'Conta conectada com permissão de publicação.');
  } catch (error) {
    console.error('linkedin_oauth_error', { message: error?.message });
    return oauthHtml(false, 'LinkedIn', 'Não foi possível concluir o OAuth. Verifique app, redirect URI e produtos habilitados.');
  }
}

async function startInstagram(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (!env.INSTAGRAM_CLIENT_ID || !env.INSTAGRAM_CLIENT_SECRET) return json({ error: 'instagram_not_configured' }, { status: 503 });
  const state = randomSecret();
  const redirectUri = callbackUri(request, env, 'instagram');
  await saveOAuthState(env, 'instagram', state, redirectUri, '/painel.html');
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', env.INSTAGRAM_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', INSTAGRAM_SCOPES.join(','));
  url.searchParams.set('state', state);
  url.searchParams.set('enable_fb_login', '0');
  url.searchParams.set('force_authentication', '1');
  return json({ authorizationUrl: url.toString(), redirectUri, scopes: INSTAGRAM_SCOPES });
}

async function instagramCallback(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return oauthHtml(false, 'Instagram', clean(url.searchParams.get('error_description') || url.searchParams.get('error'), 500));
  const code = clean(url.searchParams.get('code'), 2000).replace(/#_$/, '');
  const state = clean(url.searchParams.get('state'), 500);
  const saved = await consumeOAuthState(env, 'instagram', state);
  if (!code || !saved) return oauthHtml(false, 'Instagram', 'Código ou state inválido/expirado.');
  if (!env.INSTAGRAM_CLIENT_ID || !env.INSTAGRAM_CLIENT_SECRET) return oauthHtml(false, 'Instagram', 'Aplicação Instagram ainda não configurada no Worker.');
  try {
    const form = new URLSearchParams({ client_id: env.INSTAGRAM_CLIENT_ID, client_secret: env.INSTAGRAM_CLIENT_SECRET, grant_type: 'authorization_code', redirect_uri: saved.redirect_uri, code });
    const shortResponse = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    const shortData = await shortResponse.json().catch(() => ({}));
    if (!shortResponse.ok || !shortData.access_token) throw new Error(`TOKEN_EXCHANGE_${shortResponse.status}`);

    let accessToken = shortData.access_token;
    let expiresIn = 3600;
    let longLived = false;
    const exchangeUrl = new URL('https://graph.instagram.com/access_token');
    exchangeUrl.searchParams.set('grant_type', 'ig_exchange_token');
    exchangeUrl.searchParams.set('client_secret', env.INSTAGRAM_CLIENT_SECRET);
    exchangeUrl.searchParams.set('access_token', shortData.access_token);
    const longResponse = await fetch(exchangeUrl, { headers: { Accept: 'application/json' } });
    const longData = await longResponse.json().catch(() => ({}));
    if (longResponse.ok && longData.access_token) {
      accessToken = longData.access_token;
      expiresIn = Number(longData.expires_in || 5184000);
      longLived = true;
    }

    const version = clean(env.META_API_VERSION || 'v26.0', 20);
    const profileUrl = new URL(`https://graph.instagram.com/${version}/me`);
    profileUrl.searchParams.set('fields', 'id,username,account_type');
    const profileResponse = await fetch(profileUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const profile = await profileResponse.json().catch(() => ({}));
    const externalId = profile.id || shortData.user_id;
    if (!profileResponse.ok || !externalId) throw new Error(`PROFILE_${profileResponse.status}`);
    await upsertSocialAccount(env, {
      channel: 'instagram', accountName: profile.username ? `@${profile.username}` : `Instagram ${String(externalId).slice(-8)}`,
      externalAccountId: String(externalId), capabilities: { publishImage: true, publishCarousel: true, metrics: false },
      token: accessToken, tokenType: 'Bearer', scopes: INSTAGRAM_SCOPES, expiresAt: expiresIso(expiresIn),
      metadata: { accountType: profile.account_type || null, longLived }
    });
    return oauthHtml(true, 'Instagram', longLived ? 'Conta profissional conectada com token de longa duração.' : 'Conta conectada; será necessário renovar o token em até uma hora.');
  } catch (error) {
    console.error('instagram_oauth_error', { message: error?.message });
    return oauthHtml(false, 'Instagram', 'Não foi possível concluir o OAuth. Verifique app, conta profissional, redirect URI e permissões.');
  }
}

async function disconnect(request, env, accountId) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const current = await env.DB.prepare('SELECT id FROM social_accounts WHERE id = ?').bind(accountId).first();
  if (!current) return json({ error: 'not_found' }, { status: 404 });
  await env.DB.batch([
    env.DB.prepare('DELETE FROM social_credentials WHERE social_account_id = ?').bind(accountId),
    env.DB.prepare("UPDATE social_accounts SET status = 'disconnected', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(accountId)
  ]);
  return json({ id: accountId, status: 'disconnected' });
}

async function connectedCredential(env, channel) {
  const row = await env.DB.prepare(`
    SELECT a.*, c.access_token_enc, c.refresh_token_enc, c.expires_at, c.scopes_json, c.metadata_json
    FROM social_accounts a JOIN social_credentials c ON c.social_account_id = a.id
    WHERE a.channel = ? AND a.status = 'connected'
    ORDER BY a.updated_at DESC LIMIT 1
  `).bind(channel).first();
  if (!row) return null;
  if (row.expires_at && row.expires_at <= nowIso()) return { ...row, expired: true };
  return row;
}

async function approvedContent(env, contentId) {
  return env.DB.prepare(`SELECT * FROM content_items WHERE id = ? AND status IN ('approved','scheduled') LIMIT 1`).bind(contentId).first();
}
function publicationText(content, max = 3000) {
  return [content.hook, content.body, content.cta].filter(Boolean).join('\n\n').trim().slice(0, max);
}

async function publishLinkedIn(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const body = await parseJson(request, 10_000);
  const contentId = clean(body.contentId, 100);
  const content = await approvedContent(env, contentId);
  if (!content) return json({ error: 'approved_content_required' }, { status: 422 });
  const credential = await connectedCredential(env, 'linkedin');
  if (!credential) return json({ error: 'linkedin_not_connected' }, { status: 409 });
  if (credential.expired) return json({ error: 'linkedin_token_expired' }, { status: 401 });
  const token = await decryptSecret(env.AUTH_SECRET, credential.access_token_enc);
  const commentary = publicationText(content, 2900);
  if (!commentary) return json({ error: 'content_empty' }, { status: 422 });
  const linkedinVersion = clean(env.LINKEDIN_API_VERSION || '202604', 10);
  const response = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'LinkedIn-Version': linkedinVersion, 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify({
      author: `urn:li:person:${credential.external_account_id}`,
      commentary,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false
    })
  });
  const responseBody = await response.text();
  if (!response.ok) {
    console.error('linkedin_publish_error', { status: response.status, body: responseBody.slice(0, 500) });
    return json({ error: 'linkedin_publish_failed', status: response.status }, { status: 502 });
  }
  const externalId = response.headers.get('x-restli-id') || response.headers.get('X-RestLi-Id') || '';
  const publicationId = id('publication');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO publications (id, content_item_id, channel, external_id, status, published_at, metadata_json) VALUES (?, ?, 'linkedin', ?, 'published', CURRENT_TIMESTAMP, ?)`)
      .bind(publicationId, contentId, externalId, JSON.stringify({ linkedInVersion: linkedinVersion })),
    env.DB.prepare("UPDATE content_items SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(contentId)
  ]);
  return json({ publicationId, channel: 'linkedin', externalId, status: 'published' }, { status: 201 });
}

async function publicMedia(request, env, assetId) {
  if (!env.MEDIA?.get) return json({ error: 'r2_binding_not_configured' }, { status: 503 });
  const url = new URL(request.url);
  if (!(await verifyMediaSignature(env, assetId, url.searchParams.get('exp'), url.searchParams.get('sig')))) return json({ error: 'invalid_or_expired_signature' }, { status: 403 });
  const asset = await env.DB.prepare("SELECT storage_key, status FROM media_assets WHERE id = ? AND asset_type = 'image' LIMIT 1").bind(assetId).first();
  if (!asset?.storage_key || !['approved', 'review'].includes(asset.status)) return json({ error: 'not_found' }, { status: 404 });
  const object = await env.MEDIA.get(asset.storage_key);
  if (!object) return json({ error: 'object_not_found' }, { status: 404 });
  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=300');
  return new Response(object.body, { headers });
}

async function publishInstagram(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (!env.MEDIA?.get) return json({ error: 'r2_binding_not_configured' }, { status: 503 });
  const body = await parseJson(request, 10_000);
  const contentId = clean(body.contentId, 100);
  const content = await approvedContent(env, contentId);
  if (!content) return json({ error: 'approved_content_required' }, { status: 422 });
  const credential = await connectedCredential(env, 'instagram');
  if (!credential) return json({ error: 'instagram_not_connected' }, { status: 409 });
  if (credential.expired) return json({ error: 'instagram_token_expired' }, { status: 401 });
  const asset = body.assetId
    ? await env.DB.prepare("SELECT * FROM media_assets WHERE id = ? AND content_item_id = ? AND asset_type = 'image' AND status = 'approved'").bind(clean(body.assetId, 100), contentId).first()
    : await env.DB.prepare("SELECT * FROM media_assets WHERE content_item_id = ? AND asset_type = 'image' AND status = 'approved' ORDER BY created_at DESC LIMIT 1").bind(contentId).first();
  if (!asset) return json({ error: 'approved_image_required' }, { status: 422 });
  const token = await decryptSecret(env.AUTH_SECRET, credential.access_token_enc);
  const mediaUrl = await signedMediaUrl(request, env, asset.id, 1200);
  const caption = publicationText(content, 2100);
  const version = clean(env.META_API_VERSION || 'v26.0', 20);
  const createUrl = `https://graph.instagram.com/${version}/${encodeURIComponent(credential.external_account_id)}/media`;
  const createBody = new URLSearchParams({ image_url: mediaUrl, caption });
  const createResponse = await fetch(createUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: createBody });
  const createData = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || !createData.id) {
    console.error('instagram_container_error', { status: createResponse.status, error: createData?.error?.message });
    return json({ error: 'instagram_container_failed', status: createResponse.status }, { status: 502 });
  }
  const publishUrl = `https://graph.instagram.com/${version}/${encodeURIComponent(credential.external_account_id)}/media_publish`;
  const publishBody = new URLSearchParams({ creation_id: createData.id });
  const publishResponse = await fetch(publishUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: publishBody });
  const publishData = await publishResponse.json().catch(() => ({}));
  if (!publishResponse.ok || !publishData.id) {
    const publicationId = id('publication');
    await env.DB.prepare(`INSERT INTO publications (id, content_item_id, channel, external_id, status, metadata_json) VALUES (?, ?, 'instagram', ?, 'processing', ?)`)
      .bind(publicationId, contentId, createData.id, JSON.stringify({ assetId: asset.id, mediaUrlExpires: 1200, publishError: publishData?.error?.message || null })).run();
    return json({ publicationId, channel: 'instagram', containerId: createData.id, status: 'processing', retryRequired: true }, { status: 202 });
  }
  const publicationId = id('publication');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO publications (id, content_item_id, channel, external_id, status, published_at, metadata_json) VALUES (?, ?, 'instagram', ?, 'published', CURRENT_TIMESTAMP, ?)`)
      .bind(publicationId, contentId, publishData.id, JSON.stringify({ assetId: asset.id, containerId: createData.id })),
    env.DB.prepare("UPDATE content_items SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(contentId)
  ]);
  return json({ publicationId, channel: 'instagram', externalId: publishData.id, status: 'published' }, { status: 201 });
}

async function refreshInstagram(request, env) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const credential = await connectedCredential(env, 'instagram');
  if (!credential) return json({ error: 'instagram_not_connected' }, { status: 409 });
  const token = await decryptSecret(env.AUTH_SECRET, credential.access_token_enc);
  const url = new URL('https://graph.instagram.com/refresh_access_token');
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', token);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) return json({ error: 'instagram_refresh_failed', status: response.status }, { status: 502 });
  await env.DB.prepare(`UPDATE social_credentials SET access_token_enc = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE social_account_id = ?`)
    .bind(await encryptSecret(env.AUTH_SECRET, data.access_token), expiresIso(data.expires_in || 5184000), credential.id).run();
  return json({ channel: 'instagram', status: 'connected', expiresAt: expiresIso(data.expires_in || 5184000) });
}

export async function handleSocialRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/social')) return null;

  if (request.method === 'GET' && path === '/api/social/status') return socialStatus(request, env);
  if (request.method === 'POST' && path === '/api/social/linkedin/connect') return startLinkedIn(request, env);
  if (request.method === 'GET' && path === '/api/social/linkedin/callback') return linkedinCallback(request, env);
  if (request.method === 'POST' && path === '/api/social/instagram/connect') return startInstagram(request, env);
  if (request.method === 'GET' && path === '/api/social/instagram/callback') return instagramCallback(request, env);
  if (request.method === 'POST' && path === '/api/social/linkedin/publish') return publishLinkedIn(request, env);
  if (request.method === 'POST' && path === '/api/social/instagram/publish') return publishInstagram(request, env);
  if (request.method === 'POST' && path === '/api/social/instagram/refresh') return refreshInstagram(request, env);

  const mediaMatch = path.match(/^\/api\/social\/media\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'GET' && mediaMatch) return publicMedia(request, env, mediaMatch[1]);
  const disconnectMatch = path.match(/^\/api\/social\/accounts\/([a-zA-Z0-9_-]+)\/disconnect$/);
  if (request.method === 'POST' && disconnectMatch) return disconnect(request, env, disconnectMatch[1]);
  return json({ error: 'not_found' }, { status: 404 });
}
