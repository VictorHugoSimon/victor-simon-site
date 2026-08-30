const encoder = new TextEncoder();

export function normalizeText(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeEmail(value) {
  return normalizeText(value, 254).toLowerCase();
}

export function validateLead(input = {}) {
  const lead = {
    name: normalizeText(input.name, 120),
    email: normalizeEmail(input.email),
    phone: normalizeText(input.phone, 32),
    company: normalizeText(input.company, 160),
    role: normalizeText(input.role, 120),
    challenge: normalizeText(input.challenge, 1500),
    budget: normalizeText(input.budget, 80),
    deadline: normalizeText(input.deadline, 80),
    authority: normalizeText(input.authority, 120),
    serviceInterest: normalizeText(input.serviceInterest, 80),
    preferredContact: ['whatsapp', 'email', 'linkedin'].includes(input.preferredContact) ? input.preferredContact : 'whatsapp',
    contactConsent: input.contactConsent === true || input.contactConsent === 'yes' || input.contactConsent === 'on',
    source: normalizeText(input.source || 'website', 80),
    language: input.language === 'en' ? 'en' : 'pt'
  };

  const errors = [];
  if (lead.name.length < 2) errors.push('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) errors.push('email');
  if (lead.challenge.length < 10) errors.push('challenge');
  if (!lead.contactConsent) errors.push('contactConsent');
  return { valid: errors.length === 0, errors, lead };
}

export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export async function createToken(payload, secret, ttlSeconds = 8 * 60 * 60) {
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET_INVALID');
  const now = Math.floor(Date.now() / 1000);
  const body = toBase64Url(encoder.encode(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds })));
  const signature = toBase64Url(await hmac(secret, body));
  return `${body}.${signature}`;
}

export async function verifyToken(token, secret) {
  try {
    const [body, signature] = String(token || '').split('.');
    if (!body || !signature || !secret) return null;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), encoder.encode(body));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearerToken(request) {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

export function slugify(value) {
  return normalizeText(value, 180)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function id(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function parseJson(request, maxBytes = 32_000) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
  return text ? JSON.parse(text) : {};
}
