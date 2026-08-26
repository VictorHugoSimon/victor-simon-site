const ATTR_API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
const ATTR_PARAMS = new URLSearchParams(location.search);

function attributionSessionId() {
  const key = 'vs_session_id';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(key, created);
  return created;
}

async function sendAttribution() {
  if (!ATTR_API_BASE || ATTR_API_BASE.includes('example.invalid')) return;
  const sessionId = attributionSessionId();
  const language = ATTR_PARAMS.get('lang') === 'en' ? 'en' : 'pt';
  const metadata = {
    utm_source: ATTR_PARAMS.get('utm_source') || '',
    utm_medium: ATTR_PARAMS.get('utm_medium') || '',
    utm_campaign: ATTR_PARAMS.get('utm_campaign') || '',
    utm_term: ATTR_PARAMS.get('utm_term') || '',
    utm_content: ATTR_PARAMS.get('utm_content') || '',
    article: ATTR_PARAMS.get('post') || ''
  };
  const touch = {
    sessionId,
    source: metadata.utm_source || (document.referrer ? 'referral' : 'direct'),
    medium: metadata.utm_medium,
    campaign: metadata.utm_campaign,
    term: metadata.utm_term,
    content: metadata.utm_content || metadata.article,
    contentItemId: ATTR_PARAMS.get('vh_content') || '',
    publicationId: ATTR_PARAMS.get('vh_publication') || '',
    campaignId: ATTR_PARAMS.get('vh_campaign') || '',
    landingPage: `${location.pathname}${location.search}`.slice(0, 400),
    referrer: document.referrer,
    eventName: ATTR_PARAMS.get('post') ? 'article_view' : 'blog_view',
    metadata: { language, article: metadata.article }
  };
  try {
    await Promise.allSettled([
      fetch(`${ATTR_API_BASE}/api/growth-loop/touch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(touch), keepalive: true }),
      fetch(`${ATTR_API_BASE}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: touch.eventName, sessionId, page: location.pathname, language, metadata }), keepalive: true })
    ]);
  } catch {
    // Telemetria não interfere na leitura do blog.
  }
}

sendAttribution();
