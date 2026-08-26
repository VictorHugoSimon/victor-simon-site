import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const required = [
  'backend/worker.mjs',
  'backend/growth.mjs',
  'migrations/0001_initial_schema.sql',
  'migrations/0002_seed_reference_data.sql',
  'migrations/0003_growth_os.sql',
  'public/index.html',
  'public/blog.html',
  'public/painel.html',
  'public/assets/profile-v2.css',
  'public/assets/growth-panel.css',
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

const headers = await readFile(resolve(process.cwd(), 'public/_headers'), 'utf8');
for (const name of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy']) {
  if (!headers.includes(name)) throw new Error(`Cabeçalho ausente: ${name}`);
}

const generatedConfig = await readFile(resolve(process.cwd(), 'scripts/generate-wrangler-config.mjs'), 'utf8');
if (!generatedConfig.includes("ai: { binding: 'AI' }")) throw new Error('Binding Workers AI ausente na configuração gerada.');

console.log(`Projeto validado: ${tables.length} tabelas base + ${growthTables.length} tabelas Growth OS e arquivos essenciais presentes.`);
