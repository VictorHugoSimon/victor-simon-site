import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const required = [
  'backend/worker.mjs',
  'migrations/0001_initial_schema.sql',
  'migrations/0002_seed_reference_data.sql',
  'public/index.html',
  'public/blog.html',
  'public/painel.html',
  'public/_headers',
  'public/robots.txt',
  '.github/workflows/ci.yml',
  '.github/workflows/deploy-staging.yml',
  '.github/workflows/deploy-production.yml'
];

for (const file of required) await access(resolve(process.cwd(), file));

const worker = await import(resolve(process.cwd(), 'backend/worker.mjs'));
if (typeof worker.default?.fetch !== 'function') throw new Error('Worker sem handler fetch.');

const schema = await readFile(resolve(process.cwd(), 'migrations/0001_initial_schema.sql'), 'utf8');
const tables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi)].map((match) => match[1]);
if (tables.length < 13) throw new Error(`Schema incompleto: ${tables.length} tabelas.`);

const headers = await readFile(resolve(process.cwd(), 'public/_headers'), 'utf8');
for (const name of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy']) {
  if (!headers.includes(name)) throw new Error(`Cabeçalho ausente: ${name}`);
}

console.log(`Projeto validado: ${tables.length} tabelas e arquivos essenciais presentes.`);
