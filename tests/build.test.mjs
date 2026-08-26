import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('build de staging injeta API, canonical, Growth/social UI e bloqueia robôs', async () => {
  await exec(process.execPath, ['scripts/prepare-pages.mjs', '--environment', 'staging', '--out', 'dist-staging'], {
    env: { ...process.env, API_BASE: 'https://api-staging.example.com', SITE_BASE: 'https://victor-hugo-teixeira-simon.pages.dev', REQUIRE_API_BASE: '1' }
  });
  const [html, panel, automationUi, socialUi, robots, headers] = await Promise.all([
    readFile('dist-staging/index.html', 'utf8'),
    readFile('dist-staging/painel.html', 'utf8'),
    readFile('dist-staging/assets/growth-automation-ui.js', 'utf8'),
    readFile('dist-staging/assets/social-ui.js', 'utf8'),
    readFile('dist-staging/robots.txt', 'utf8'),
    readFile('dist-staging/_headers', 'utf8')
  ]);
  assert.ok(html.includes('https://api-staging.example.com'));
  assert.ok(!html.includes('__API_BASE__'));
  assert.ok(html.includes('https://victor-hugo-teixeira-simon.pages.dev'));
  assert.ok(!html.includes('https://www.victorhugoteixeirasimon.com.br'));
  assert.ok(panel.includes('/assets/growth-automation-ui.js'));
  assert.ok(panel.includes('/assets/social-ui.js'));
  assert.ok(automationUi.includes('Automação Multicanal & Mídia'));
  assert.ok(socialUi.includes('Conectores oficiais'));
  assert.ok(socialUi.includes('Publicar no LinkedIn'));
  assert.ok(socialUi.includes('Publicar no Instagram'));
  assert.match(robots, /Disallow: \/$/m);
  assert.match(headers, /X-Robots-Tag: noindex/);
});

test('build de produção mantém indexação e módulos de automação do painel', async () => {
  await exec(process.execPath, ['scripts/prepare-pages.mjs', '--environment', 'production', '--out', 'dist-production'], {
    env: { ...process.env, API_BASE: 'https://api.example.com', SITE_BASE: 'https://victor-hugo-teixeira-simon.pages.dev', REQUIRE_API_BASE: '1' }
  });
  const [robots, html, panel] = await Promise.all([
    readFile('dist-production/robots.txt', 'utf8'),
    readFile('dist-production/index.html', 'utf8'),
    readFile('dist-production/painel.html', 'utf8')
  ]);
  assert.match(robots, /Allow: \/$/m);
  assert.ok(html.includes('https://victor-hugo-teixeira-simon.pages.dev'));
  assert.ok(panel.includes('/assets/growth-automation-ui.js'));
  assert.ok(panel.includes('/assets/social-ui.js'));
});
