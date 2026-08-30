const apiUrl = String(process.env.API_URL || '').replace(/\/+$/, '');
const siteUrl = String(process.env.SITE_URL || '').replace(/\/+$/, '');
if (!apiUrl || !siteUrl) throw new Error('API_URL e SITE_URL são obrigatórias.');

async function check(url, predicate, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      const body = await response.text();
      if (response.ok && predicate(body, response)) return;
      lastError = new Error(`${url} respondeu ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
  }
  throw lastError;
}

await check(`${apiUrl}/api/health`, (body) => JSON.parse(body).status === 'ok');
await check(siteUrl, (body) => body.includes('Victor Hugo') && body.includes('__API_BASE__') === false);
await check(`${siteUrl}/blog.html`, (body) => body.includes('Blog') && body.includes('/assets/blog.js'));
await check(`${siteUrl}/painel.html`, (body) => body.includes('Growth OS') && body.includes('noindex'));
await check(`${siteUrl}/assets/app.js`, (body, response) => response.headers.get('content-type')?.includes('javascript') && body.includes('menuToggle'));
await check(`${siteUrl}/assets/logo-code-solution.svg`, (body, response) => response.headers.get('content-type')?.includes('svg') && body.includes('<svg'));
console.log('Smoke test concluído: API, páginas críticas, JavaScript e logos respondendo.');
