import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const environment = arg('--environment', process.env.DEPLOY_ENVIRONMENT || 'staging');
const outputName = arg('--out', 'dist');
const apiBase = String(process.env.API_BASE || 'https://api.example.invalid').replace(/\/+$/, '');
const siteBase = String(process.env.SITE_BASE || 'https://victor-hugo-teixeira-simon.pages.dev').replace(/\/+$/, '');
const legacySiteBase = 'https://www.victorhugoteixeirasimon.com.br';
const socialImage = 'https://avatars.githubusercontent.com/u/111150704?v=4';
if (!['staging', 'production'].includes(environment)) throw new Error('Ambiente inválido.');
if (process.env.REQUIRE_API_BASE === '1' && apiBase.includes('example.invalid')) {
  throw new Error('API_BASE é obrigatória no deploy.');
}

const root = resolve(process.cwd());
const source = resolve(root, 'public');
const output = resolve(root, outputName);
if (!output.startsWith(`${root}${sep}`) || !['dist', 'dist-staging', 'dist-production'].includes(basename(output))) {
  throw new Error('Diretório de saída não permitido.');
}

function injectPublicExperience(content, file) {
  if (!['index.html', 'blog.html'].includes(file)) return content;
  const isBlog = file === 'blog.html';
  const title = isBlog
    ? 'Blog | Victor Hugo Simon'
    : 'Victor Hugo | Consultoria, Produto, Projetos e Tecnologia';
  const description = isBlog
    ? 'Conteúdos práticos sobre PMO, produto digital, governança, tecnologia, IA e inteligência de mercado.'
    : 'Victor Hugo Teixeira Simon — consultoria executiva em Produto, Projetos, PMO, Transformação Digital, IA, Automação e Inteligência de Mercado.';
  const url = `${siteBase}${isBlog ? '/blog.html' : '/'}`;
  const meta = [
    '<meta name="theme-color" content="#111827">',
    '<meta name="referrer" content="strict-origin-when-cross-origin">',
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${socialImage}">`,
    '<meta property="og:image:alt" content="Victor Hugo Teixeira Simon">',
    '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${socialImage}">`,
    '<style>.skip-link{position:fixed;left:16px;top:12px;z-index:9999;transform:translateY(-160%);background:#111827;color:#fff;padding:10px 14px;border-radius:10px;font:700 14px/1.2 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(17,24,39,.18)}.skip-link:focus{transform:translateY(0);outline:3px solid rgba(176,138,74,.45);outline-offset:2px}</style>'
  ].join('\n  ');
  if (!content.includes('property="og:title"')) {
    content = content.replace('</head>', `  ${meta}\n</head>`);
  }
  if (!content.includes('class="skip-link"')) {
    content = content.replace('<body>', '<body>\n  <a class="skip-link" href="#main-content">Pular para o conteúdo principal</a>');
  }
  if (!content.includes('id="main-content"')) {
    content = content.replace('<main>', '<main id="main-content" tabindex="-1">');
  }
  if (isBlog && !content.includes('/assets/attribution.js')) {
    content = content.replace('</body>', '  <script type="module" src="/assets/attribution.js"></script>\n</body>');
  }
  return content;
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

for (const file of ['index.html', 'blog.html', 'painel.html', 'assets/app.js', 'assets/blog.js', 'assets/panel.js', 'assets/growth-automation-ui.js', 'assets/social-ui.js', 'assets/growth-loop-ui.js', 'assets/attribution.js']) {
  const path = resolve(output, file);
  let content = await readFile(path, 'utf8');
  content = content
    .replaceAll('__API_BASE__', apiBase)
    .replaceAll('__ENVIRONMENT__', environment)
    .replaceAll(legacySiteBase, siteBase);
  content = injectPublicExperience(content, file);
  if (file === 'painel.html') {
    for (const script of ['growth-automation-ui.js', 'social-ui.js', 'growth-loop-ui.js']) {
      if (!content.includes(`/assets/${script}`)) {
        content = content.replace('</body>', `  <script type="module" src="/assets/${script}"></script>\n</body>`);
      }
    }
  }
  await writeFile(path, content);
}

if (environment === 'staging') {
  await writeFile(resolve(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  const headersPath = resolve(output, '_headers');
  const headers = await readFile(headersPath, 'utf8');
  await writeFile(headersPath, `${headers.trim()}\n\n/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n`);
}

console.log(`Site preparado em ${outputName} para ${environment} usando ${siteBase}.`);
