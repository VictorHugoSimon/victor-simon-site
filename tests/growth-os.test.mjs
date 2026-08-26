import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Home V2 preserva posicionamento e seções do protótipo', async () => {
  const html = await text('public/index.html');
  for (const expected of [
    'Clareza para decidir. Método para executar. Resultado para crescer.',
    'id="consultoria"',
    'id="servicos"',
    'id="metodo"',
    'id="projetos"',
    'id="ifarm"',
    'id="sobre"',
    'id="contato"',
    '/blog.html'
  ]) assert.ok(html.includes(expected), `Home sem ${expected}`);
  assert.ok(!html.includes('class="initials">VS</span>'), 'Placeholder VS antigo voltou para a Home.');
});

test('Growth OS mantém módulos executivos e nove agentes', async () => {
  const html = await text('public/painel.html');
  for (const module of [
    'Visão Executiva', 'Central de Conteúdo', 'Calendário Editorial', 'Agentes IA',
    'Canais & Social', 'Blog & SEO', 'CRM & Leads', 'Recomendações IA'
  ]) assert.ok(html.includes(module), `Painel sem módulo ${module}`);
  for (const agent of ['Radar', 'Estrategista', 'Pesquisador', 'Blog Writer', 'Social Repurposer', 'Revisor', 'Publicador', 'Analytics', 'Growth Coach']) {
    assert.ok(html.includes(`>${agent}<`), `Painel sem agente ${agent}`);
  }
});

test('Blog possui leitura completa e conteúdo evergreen', async () => {
  const [html, js] = await Promise.all([text('public/blog.html'), text('public/assets/blog.js')]);
  assert.ok(html.includes('id="articleView"'));
  assert.ok(html.includes('id="articleContent"'));
  for (const slug of ['pmo-que-decide', 'ia-aplicada-comece-pelo-problema', 'backlog-orientado-a-valor']) {
    assert.ok(js.includes(slug), `Blog sem artigo ${slug}`);
  }
});

test('Migration Growth OS é aditiva e contém entidades essenciais', async () => {
  const sql = await text('migrations/0003_growth_os.sql');
  const tables = [
    'content_ideas', 'content_items', 'media_assets', 'campaigns', 'publications',
    'publication_metrics', 'approvals', 'agent_runs', 'social_accounts', 'growth_recommendations'
  ];
  for (const table of tables) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\b`, 'i'));
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i, 'Migration Growth OS contém operação destrutiva.');
});

test('CSP permite somente a origem externa necessária para a foto temporária', async () => {
  const headers = await text('public/_headers');
  assert.match(headers, /img-src[^\n]+https:\/\/avatars\.githubusercontent\.com/);
  assert.doesNotMatch(headers, /img-src[^\n]+https:\s*;/, 'CSP abriu imagens HTTPS de forma irrestrita.');
});
