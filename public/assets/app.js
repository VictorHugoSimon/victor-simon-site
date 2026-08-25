const API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
const params = new URLSearchParams(location.search);
let language = params.get('lang') === 'en' ? 'en' : 'pt';

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

async function track(event, metadata = {}) {
  if (!API_BASE || API_BASE.includes('example.invalid')) return;
  try {
    await fetch(`${API_BASE}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, metadata, sessionId: sessionId(), page: location.pathname, language }),
      keepalive: true
    });
  } catch {
    // Métricas jamais devem interromper a experiência principal.
  }
}

document.querySelectorAll('[data-event]').forEach((element) => {
  element.addEventListener('click', () => track(element.dataset.event));
});
track('page_view');

const leadForm = document.querySelector('#leadForm');
leadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('#formStatus');
  const button = leadForm.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(leadForm).entries());
  payload.language = language;
  payload.source = 'website';
  status.className = 'form-status';
  status.textContent = language === 'en' ? 'Sending securely…' : 'Enviando com segurança…';
  button.disabled = true;
  try {
    if (!API_BASE || API_BASE.includes('example.invalid')) throw new Error('API_NOT_CONFIGURED');
    const response = await fetch(`${API_BASE}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    status.className = 'form-status success';
    status.textContent = language === 'en'
      ? 'Context received. Our triage will direct the next step.'
      : 'Contexto recebido. Nossa triagem direcionará o próximo passo.';
    leadForm.reset();
    track('lead_submitted');
  } catch {
    status.className = 'form-status error';
    status.textContent = language === 'en'
      ? 'We could not send it now. Please use the Code Solution WhatsApp button.'
      : 'Não foi possível enviar agora. Use o botão de WhatsApp da Code Solution.';
  } finally {
    button.disabled = false;
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
