import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const required = [
  'backend/worker.mjs',
  'backend/growth.mjs',
  'backend/growth-automation.mjs',
  'backend/social.mjs',
  'migrations/0001_initial_schema.sql',
  'migrations/0002_seed_reference_data.sql',
  'migrations/0003_growth_os.sql',
  'migrations/0004_social_oauth.sql',
  'public/index.html',
  'public/blog.html',
  'public/painel.html',
  'public/assets/profile-v2.css',
  'public/assets/growth-panel.css',
  'public/assets/growth-automation-ui.js',
  'public/assets/social-ui.js',
  'public/_headers',
  'public/robots.txt',
  '.github/workflows/ci.yml',
  '.github/workflows/growth-os-ci.yml',
  '.github/workflows/deploy-staging.yml',
  '.github/workflows/deploy-production.yml'
];

for (const file of required) await access(resolve(process.cwd(), file));

const worker = await import(resolve(process.cwd(), 'backend/worker.mjs'));
if (typeof worker.default?.fetch !== 'function') throw new Error('Worker sem handler fetch.');

const schema = await readFile(resolve(process.cwd(), 'migrations/0001_initial_schema.sql'), 'utf8');
const tables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi)].map((match) => match[1]);
if (tables.length < 13) throw new Error(`Schema base incompleto: ${tables.length} tabelas.`);

const growthSchema = await readFile(resolve(process.cwd(), 'migrations/0003_growth_os.sql'), 'utf8');
const growthTables = [...growthSchema.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi)].map((match) => match[1]);
for (const expected of ['content_ideas', 'content_items', 'media_assets', 'publications', 'publication_metrics', 'agent_runs', 'social_accounts', 'growth_recommendations']) {
  if (!growthTables.includes(expected)) throw new Error(`Growth OS sem tabela obrigatória: ${expected}`);
}
if (/\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i.test(growthSchema)) throw new Error('Migration Growth OS contém operação destrutiva.');

const socialSchema = await readFile(resolve(process.cwd(), 'migrations/0004_social_oauth.sql'), 'utf8');
for (const expected of ['oauth_states', 'social_credentials']) {
  if (!new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${expected}\\b`, 'i').test(socialSchema)) throw new Error(`OAuth social sem tabela obrigatória: ${expected}`);
}
if (/\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i.test(socialSchema)) throw new Error('Migration OAuth contém operação destrutiva.');

const headers = await readFile(resolve(process.cwd(), 'public/_headers'), 'utf8');
for (const name of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy']) {
  if (!headers.includes(name)) throw new Error(`Cabeçalho ausente: ${name}`);
}

const [generatedConfig, bootstrap, automation, social, workerSource, preparePages] = await Promise.all([
  readFile(resolve(process.cwd(), 'scripts/generate-wrangler-config.mjs'), 'utf8'),
  readFile(resolve(process.cwd(), 'scripts/bootstrap-cloudflare.mjs'), 'utf8'),
  readFile(resolve(process.cwd(), 'backend/growth-automation.mjs'), 'utf8'),
  readFile(resolve(process.cwd(), 'backend/social.mjs'), 'utf8'),
  readFile(resolve(process.cwd(), 'backend/worker.mjs'), 'utf8'),
  readFile(resolve(process.cwd(), 'scripts/prepare-pages.mjs'), 'utf8')
]);
if (!generatedConfig.includes("ai: { binding: 'AI' }")) throw new Error('Binding Workers AI ausente na configuração gerada.');
if (!generatedConfig.includes("binding: 'MEDIA'")) throw new Error('Binding R2 MEDIA opcional ausente.');
if (!bootstrap.includes('/r2/buckets')) throw new Error('Bootstrap não provisiona R2.');
if (!automation.includes('@cf/black-forest-labs/flux-1-schnell')) throw new Error('Art Director não usa modelo de imagem esperado.');
if (!automation.includes('social_repurposer')) throw new Error('Social Repurposer ausente.');
if (!workerSource.includes('handleGrowthAutomationRoute')) throw new Error('Worker não roteia automações Growth.');
if (!workerSource.includes('handleSocialRoute')) throw new Error('Worker não roteia conectores sociais.');
if (!social.includes("{ name: 'AES-GCM'")) throw new Error('Tokens sociais não usam AES-GCM.');
if (!social.includes('instagram_business_content_publish')) throw new Error('Escopo atual de publicação Instagram ausente.');
if (!social.includes('w_member_social')) throw new Error('Escopo de publicação LinkedIn ausente.');
if (!social.includes('approved_content_required')) throw new Error('Publicador social não exige aprovação.');
if (!preparePages.includes('/assets/social-ui.js')) throw new Error('Build não injeta interface social.');

console.log(`Projeto validado: ${tables.length} tabelas base + ${growthTables.length} tabelas Growth OS, OAuth social seguro, IA, R2 opcional e automações presentes.`);
