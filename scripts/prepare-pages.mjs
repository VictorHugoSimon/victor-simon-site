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

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

for (const file of ['index.html', 'blog.html', 'painel.html', 'assets/app.js', 'assets/blog.js', 'assets/panel.js', 'assets/growth-automation-ui.js', 'assets/social-ui.js']) {
  const path = resolve(output, file);
  let content = await readFile(path, 'utf8');
  content = content
    .replaceAll('__API_BASE__', apiBase)
    .replaceAll('__ENVIRONMENT__', environment)
    .replaceAll(legacySiteBase, siteBase);
  if (file === 'painel.html') {
    if (!content.includes('/assets/growth-automation-ui.js')) {
      content = content.replace('</body>', '  <script type="module" src="/assets/growth-automation-ui.js"></script>\n</body>');
    }
    if (!content.includes('/assets/social-ui.js')) {
      content = content.replace('</body>', '  <script type="module" src="/assets/social-ui.js"></script>\n</body>');
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
