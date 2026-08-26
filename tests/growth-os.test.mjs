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
    'id="consultoria"', 'id="servicos"', 'id="metodo"', 'id="projetos"',
    'id="ifarm"', 'id="sobre"', 'id="contato"', '/blog.html'
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
  for (const action of ['newIdeaButton', 'generateDraftButton', 'contentKanban']) assert.ok(html.includes(`id="${action}"`), `Painel sem ação ${action}`);
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

test('Growth API possui CRUD editorial, aprovação e geração assistida', async () => {
  const [growth, worker, config] = await Promise.all([
    text('backend/growth.mjs'),
    text('backend/worker.mjs'),
    text('scripts/generate-wrangler-config.mjs')
  ]);
  for (const route of [
    '/api/growth/summary', '/api/growth/ideas', '/api/growth/content', '/api/growth/calendar',
    '/api/growth/recommendations', '/api/growth/agents/runs', '/api/growth/generate'
  ]) assert.ok(growth.includes(route), `Growth API sem ${route}`);
  assert.ok(growth.includes('/decision'), 'Fluxo de aprovação/rejeição ausente.');
  assert.ok(growth.includes("@cf/zai-org/glm-4.7-flash"), 'Modelo editorial Workers AI ausente.');
  assert.ok(worker.includes("import { handleGrowthRoute } from './growth.mjs'"), 'Worker principal não integra Growth API.');
  assert.ok(config.includes("ai: { binding: 'AI' }"), 'Binding Workers AI ausente.');
});

test('Automação multicanal gera derivados e mídia privada em R2', async () => {
  const [automation, worker, config, bootstrap, ui] = await Promise.all([
    text('backend/growth-automation.mjs'),
    text('backend/worker.mjs'),
    text('scripts/generate-wrangler-config.mjs'),
    text('scripts/bootstrap-cloudflare.mjs'),
    text('public/assets/growth-automation-ui.js')
  ]);
  for (const route of ['/api/growth/media', '/api/growth/media/generate', '/repurpose']) {
    assert.ok(automation.includes(route), `Automação sem rota ${route}`);
  }
  assert.ok(automation.includes("@cf/black-forest-labs/flux-1-schnell"), 'Art Director sem FLUX.1 schnell.');
  assert.ok(automation.includes("'social_repurposer'"), 'Social Repurposer não registra execução.');
  assert.ok(automation.includes("status = 'draft'") || automation.includes("'draft'"), 'Derivados não preservam draft.');
  assert.ok(automation.includes("'review'"), 'Mídia gerada não entra em revisão.');
  assert.ok(worker.includes('handleGrowthAutomationRoute'), 'Worker não integra automação Growth.');
  assert.ok(config.includes("binding: 'MEDIA'"), 'Wrangler não prepara binding R2 MEDIA.');
  assert.ok(bootstrap.includes('/r2/buckets'), 'Bootstrap não tenta provisionar R2.');
  assert.ok(ui.includes('Gerar LinkedIn + Instagram + Newsletter'), 'Painel não expõe automação multicanal.');
  assert.ok(ui.includes('Biblioteca de Mídia'), 'Painel não expõe biblioteca de mídia.');
});

test('OAuth social usa estado descartável, criptografia e escopos atuais', async () => {
  const [sql, social, worker, ui, build] = await Promise.all([
    text('migrations/0004_social_oauth.sql'),
    text('backend/social.mjs'),
    text('backend/worker.mjs'),
    text('public/assets/social-ui.js'),
    text('scripts/prepare-pages.mjs')
  ]);
  for (const table of ['oauth_states', 'social_credentials']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\b`, 'i'));
  }
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i, 'Migration social contém operação destrutiva.');
  assert.ok(social.includes("{ name: 'AES-GCM'"), 'Tokens sociais não usam AES-GCM.');
  assert.ok(social.includes('state_hash'), 'OAuth não persiste state com hash.');
  assert.ok(social.includes('consumed_at'), 'OAuth state não possui consumo único.');
  assert.ok(social.includes('w_member_social'), 'Escopo LinkedIn de publicação ausente.');
  assert.ok(social.includes('instagram_business_basic'), 'Escopo Instagram básico atual ausente.');
  assert.ok(social.includes('instagram_business_content_publish'), 'Escopo Instagram de publicação atual ausente.');
  assert.ok(social.includes('approved_content_required'), 'Publicador não exige conteúdo aprovado.');
  assert.ok(social.includes("https://api.linkedin.com/rest/posts"), 'Posts API atual do LinkedIn ausente.');
  assert.ok(social.includes("https://graph.instagram.com/"), 'Instagram Graph API ausente.');
  assert.ok(worker.includes('handleSocialRoute'), 'Worker não integra conectores sociais.');
  assert.ok(ui.includes('Conectores oficiais'), 'Painel não expõe workspace de conectores oficiais.');
  assert.ok(ui.includes('Publicar no LinkedIn') && ui.includes('Publicar no Instagram'), 'Painel não expõe publicação aprovada.');
  assert.ok(build.includes('/assets/social-ui.js'), 'Build não injeta interface social.');
});

test('CSP permite somente a origem externa necessária para a foto temporária', async () => {
  const headers = await text('public/_headers');
  assert.match(headers, /img-src[^\n]+https:\/\/avatars\.githubusercontent\.com/);
  assert.doesNotMatch(headers, /img-src[^\n]+https:\s*;/, 'CSP abriu imagens HTTPS de forma irrestrita.');
});
