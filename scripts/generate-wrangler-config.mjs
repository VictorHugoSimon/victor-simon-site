import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const environment = process.env.DEPLOY_ENVIRONMENT || process.argv[2];
const required = ['WORKER_NAME', 'D1_DATABASE_NAME', 'D1_DATABASE_ID', 'CORS_ORIGIN'];
const missing = required.filter((key) => !process.env[key]);

if (!['staging', 'production'].includes(environment)) {
  throw new Error('DEPLOY_ENVIRONMENT deve ser staging ou production.');
}
if (missing.length) throw new Error(`Variáveis ausentes: ${missing.join(', ')}`);
if (!/^[0-9a-f-]{36}$/i.test(process.env.D1_DATABASE_ID)) {
  throw new Error('D1_DATABASE_ID não tem formato UUID válido.');
}
if (!/^https:\/\//.test(process.env.CORS_ORIGIN)) {
  throw new Error('CORS_ORIGIN deve usar HTTPS.');
}

const defaultCron = environment === 'production' ? '17 11 * * *' : '47 11 * * *';
const growthCron = process.env.GROWTH_CRON || defaultCron;
const cronEnabled = environment === 'production' && process.env.DISABLE_GROWTH_CRON !== '1';

const config = {
  $schema: 'https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json',
  name: process.env.WORKER_NAME,
  main: 'backend/worker-entry.mjs',
  compatibility_date: '2026-08-25',
  observability: { enabled: true, head_sampling_rate: environment === 'production' ? 0.25 : 1 },
  ...(cronEnabled ? { triggers: { crons: [growthCron] } } : {}),
  vars: {
    ENVIRONMENT: environment,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    PUBLIC_API_BASE: String(process.env.API_BASE || '').replace(/\/+$/, ''),
    ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
    LINKEDIN_API_VERSION: process.env.LINKEDIN_API_VERSION || '202604',
    META_API_VERSION: process.env.META_API_VERSION || 'v26.0',
    GROWTH_LOOP_ENABLED: '1'
  },
  ai: { binding: 'AI' },
  d1_databases: [{
    binding: 'DB',
    database_name: process.env.D1_DATABASE_NAME,
    database_id: process.env.D1_DATABASE_ID,
    migrations_dir: 'migrations'
  }]
};

if (process.env.R2_READY === '1' && process.env.R2_BUCKET_NAME) {
  config.r2_buckets = [{ binding: 'MEDIA', bucket_name: process.env.R2_BUCKET_NAME }];
}

const output = resolve(process.cwd(), 'wrangler.generated.jsonc');
await writeFile(output, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log(`Configuração Wrangler gerada para ${environment} com D1, Workers AI, Growth Loop cron ${cronEnabled ? growthCron : 'desativado'}, LinkedIn ${config.vars.LINKEDIN_API_VERSION}, Meta ${config.vars.META_API_VERSION}${config.r2_buckets ? ' e R2 MEDIA' : ''}.`);
