const API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
const WHATSAPP_NUMBER = '5518991591228';
const params = new URLSearchParams(location.search);
let language = params.get('lang') === 'en' ? 'en' : 'pt';

const attribution = {
  source: params.get('utm_source') || '',
  medium: params.get('utm_medium') || '',
  campaign: params.get('utm_campaign') || '',
  term: params.get('utm_term') || '',
  content: params.get('utm_content') || '',
  contentItemId: params.get('vh_content') || '',
  publicationId: params.get('vh_publication') || '',
  campaignId: params.get('vh_campaign') || ''
};

function applyLanguage() {
  document.documentElement.lang = language === 'en' ? 'en' : 'pt-BR';
  document.querySelectorAll('[data-pt][data-en]').forEach((element) => {
    element.textContent = element.dataset[language];
  });
  const next = new URL(location.href);
  next.searchParams.set('lang', language);
  history.replaceState({}, '', next);
}

document.querySelector('#langToggle')?.addEventListener('click', () => {
  language = language === 'pt' ? 'en' : 'pt';
  applyLanguage();
  track('language_change', { language });
});
applyLanguage();

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const people = document.querySelector('#people');
const hours = document.querySelector('#hours');
const cost = document.querySelector('#cost');
function updateRoi() {
  if (!people || !hours || !cost) return;
  document.querySelector('#peopleValue').textContent = people.value;
  document.querySelector('#hoursValue').textContent = `${hours.value}h`;
  document.querySelector('#costValue').textContent = currency.format(Number(cost.value));
  document.querySelector('#roiNumber').textContent = currency.format(Number(people.value) * Number(hours.value) * Number(cost.value) * 12);
}
[people, hours, cost].forEach((input) => input?.addEventListener('input', updateRoi));
[people, hours, cost].forEach((input) => input?.addEventListener('change', () => track('roi_calculated', {
  people: Number(people.value), hours: Number(hours.value), cost: Number(cost.value)
})));
updateRoi();

function sessionId() {
  const key = 'vs_session_id';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(key, created);
  return created;
}

function attributionMetadata(extra = {}) {
  return {
    ...extra,
    utm_source: attribution.source,
    utm_medium: attribution.medium,
    utm_campaign: attribution.campaign,
    utm_term: attribution.term,
    utm_content: attribution.content,
    contentItemId: attribution.contentItemId,
    publicationId: attribution.publicationId,
    campaignId: attribution.campaignId
  };
}

async function track(event, metadata = {}) {
  if (!API_BASE || API_BASE.includes('example.invalid')) return;
  try {
    await fetch(`${API_BASE}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, metadata: attributionMetadata(metadata), sessionId: sessionId(), page: location.pathname, language }),
      keepalive: true
    });
  } catch {
    // Métricas jamais devem interromper a experiência principal.
  }
}

async function trackAttributionTouch(eventName = 'page_view') {
  if (!API_BASE || API_BASE.includes('example.invalid')) return;
  try {
    await fetch(`${API_BASE}/api/growth-loop/touch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId(),
        source: attribution.source || (document.referrer ? 'referral' : 'direct'),
        medium: attribution.medium,
        campaign: attribution.campaign,
        term: attribution.term,
        content: attribution.content,
        contentItemId: attribution.contentItemId,
        publicationId: attribution.publicationId,
        campaignId: attribution.campaignId,
        landingPage: `${location.pathname}${location.search}`.slice(0, 400),
        referrer: document.referrer,
        eventName,
        metadata: { language }
      }),
      keepalive: true
    });
  } catch {
    // Atribuição é best-effort e nunca bloqueia a experiência pública.
  }
}

document.querySelectorAll('[data-event]').forEach((element) => {
  element.addEventListener('click', () => track(element.dataset.event));
});
track('page_view');
trackAttributionTouch('page_view');

const leadForm = document.querySelector('#leadForm');

function whatsappLeadUrl(payload) {
  const budgetSelect = leadForm?.querySelector('[name="budget"]');
  const budget = budgetSelect?.selectedOptions?.[0]?.textContent?.trim() || '';
  const value = (key) => String(payload[key] || '').trim();
  const lines = language === 'en'
    ? [
        'Hello Victor! I sent a project request through your website.',
        '',
        `Name: ${value('name')}`,
        `Email: ${value('email')}`,
        value('company') && `Company: ${value('company')}`,
        value('phone') && `Phone: ${value('phone')}`,
        `Challenge: ${value('challenge')}`,
        budget && `Investment range: ${budget}`,
        value('deadline') && `Desired timeline: ${value('deadline')}`,
        value('authority') && `Role in the decision: ${value('authority')}`
      ]
    : [
        'Olá, Victor! Enviei uma solicitação de projeto pelo seu site.',
        '',
        `Nome: ${value('name')}`,
        `E-mail: ${value('email')}`,
        value('company') && `Empresa: ${value('company')}`,
        value('phone') && `Telefone: ${value('phone')}`,
        `Desafio: ${value('challenge')}`,
        budget && `Faixa de investimento: ${budget}`,
        value('deadline') && `Prazo desejado: ${value('deadline')}`,
        value('authority') && `Papel na decisão: ${value('authority')}`
      ];
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`;
}

leadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('#formStatus');
  const button = leadForm.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(leadForm).entries());
  payload.language = language;
  payload.source = attribution.source || 'website';
  payload.sessionId = sessionId();
  const whatsappUrl = whatsappLeadUrl(payload);
  status.className = 'form-status';
  status.textContent = language === 'en'
    ? 'Registering your request and opening WhatsApp…'
    : 'Registrando sua solicitação e abrindo o WhatsApp…';
  button.disabled = true;
  try {
    if (!API_BASE || API_BASE.includes('example.invalid')) throw new Error('API_NOT_CONFIGURED');
    const response = await fetch(`${API_BASE}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    status.className = 'form-status success';
    status.textContent = language === 'en'
      ? 'Request registered. Review the message in WhatsApp and tap Send.'
      : 'Solicitação registrada. Revise a mensagem no WhatsApp e toque em Enviar.';
    track('lead_submitted', { leadId: data.id || '' });
    trackAttributionTouch('lead_submitted');
  } catch {
    status.className = 'form-status success';
    status.textContent = language === 'en'
      ? 'Opening WhatsApp. Review the message and tap Send.'
      : 'Abrindo o WhatsApp. Revise a mensagem e toque em Enviar.';
  } finally {
    button.disabled = false;
    window.location.assign(whatsappUrl);
  }
});

document.querySelector('#newsletterForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const email = new FormData(form).get('email');
  track('newsletter_interest', { emailDomain: String(email).split('@')[1] || '' });
  form.reset();
  alert(language === 'en' ? 'Interest registered. Thank you.' : 'Interesse registrado. Obrigado.');
});
