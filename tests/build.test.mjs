import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('build de staging injeta API, URL canônica e bloqueia robôs', async () => {
  await exec(process.execPath, ['scripts/prepare-pages.mjs', '--environment', 'staging', '--out', 'dist-staging'], {
    env: { ...process.env, API_BASE: 'https://api-staging.example.com', SITE_BASE: 'https://victor-hugo-teixeira-simon.pages.dev', REQUIRE_API_BASE: '1' }
  });
  const [html, robots, headers] = await Promise.all([
    readFile('dist-staging/index.html', 'utf8'),
    readFile('dist-staging/robots.txt', 'utf8'),
    readFile('dist-staging/_headers', 'utf8')
  ]);
  assert.ok(html.includes('https://api-staging.example.com'));
  assert.ok(!html.includes('__API_BASE__'));
  assert.ok(html.includes('https://victor-hugo-teixeira-simon.pages.dev'));
  assert.ok(!html.includes('https://www.victorhugoteixeirasimon.com.br'));
  assert.match(robots, /Disallow: \/$/m);
  assert.match(headers, /X-Robots-Tag: noindex/);
});

test('build de produção mantém indexação', async () => {
  await exec(process.execPath, ['scripts/prepare-pages.mjs', '--environment', 'production', '--out', 'dist-production'], {
    env: { ...process.env, API_BASE: 'https://api.example.com', SITE_BASE: 'https://victor-hugo-teixeira-simon.pages.dev', REQUIRE_API_BASE: '1' }
  });
  const [robots, html] = await Promise.all([
    readFile('dist-production/robots.txt', 'utf8'),
    readFile('dist-production/index.html', 'utf8')
  ]);
  assert.match(robots, /Allow: \/$/m);
  assert.ok(html.includes('https://victor-hugo-teixeira-simon.pages.dev'));
});
