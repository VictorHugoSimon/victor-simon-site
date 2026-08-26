import { appendFile } from 'node:fs/promises';

let accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const accountName = process.env.CLOUDFLARE_ACCOUNT_NAME || '';
const token = process.env.CLOUDFLARE_API_TOKEN;
const databaseName = process.env.D1_DATABASE_NAME;
const pagesProjectName = process.env.PAGES_PROJECT_NAME;
const productionBranch = process.env.PAGES_PRODUCTION_BRANCH || 'main';
const r2BucketName = process.env.R2_BUCKET_NAME || '';

for (const [key, value] of Object.entries({ token, databaseName, pagesProjectName })) {
  if (!value) throw new Error(`Configuração ausente: ${key}`);
}

async function api(url, init = {}, accepted = [200]) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!accepted.includes(response.status) || (response.ok && data.success === false)) {
    const details = (data.errors || []).map((error) => `${error.code}: ${error.message}`).join('; ');
    const error = new Error(`Cloudflare ${response.status}${details ? ` — ${details}` : ''}`);
    error.status = response.status;
    error.details = details;
    throw error;
  }
  return { status: response.status, data };
}

async function accountApi(targetAccountId, path, init = {}, accepted = [200]) {
  return api(`https://api.cloudflare.com/client/v4/accounts/${targetAccountId}${path}`, init, accepted);
}

async function discoverAccount() {
  if (accountId) return accountId;
  const response = await api('https://api.cloudflare.com/client/v4/accounts?per_page=50');
  const accounts = Array.isArray(response.data.result) ? response.data.result : [];
  if (!accounts.length) throw new Error('Nenhuma conta Cloudflare acessível com o API Token.');
  if (accountName) {
    const exact = accounts.find((item) => String(item.name || '').toLowerCase() === accountName.toLowerCase());
    if (exact?.id) return exact.id;
  }
  if (accounts.length === 1 && accounts[0]?.id) return accounts[0].id;

  const matches = [];
  for (const account of accounts) {
    if (!account?.id) continue;
    let score = 0;
    try {
      const pages = await accountApi(account.id, `/pages/projects/${encodeURIComponent(pagesProjectName)}`, { method: 'GET' }, [200, 404]);
      if (pages.status === 200) score += 2;
    } catch {}
    try {
      const d1 = await accountApi(account.id, `/d1/database?name=${encodeURIComponent(databaseName)}&per_page=100`);
      if (d1.data.result?.some((item) => item.name === databaseName)) score += 2;
    } catch {}
    if (score > 0) matches.push({ id: account.id, name: account.name, score });
  }
  matches.sort((a, b) => b.score - a.score);
  if (matches.length === 1 || (matches[0] && matches[0].score > (matches[1]?.score || 0))) return matches[0].id;
  throw new Error('O API Token acessa múltiplas contas Cloudflare e não foi possível escolher com segurança. Defina CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_ACCOUNT_NAME.');
}

accountId = await discoverAccount();
console.log(`Conta Cloudflare identificada: ${accountId.slice(0, 6)}…`);

async function cloudflare(path, init = {}, accepted = [200]) {
  try {
    return await accountApi(accountId, path, init, accepted);
  } catch (error) {
    throw new Error(`Cloudflare em ${path}: ${error.message}`);
  }
}

const databases = await cloudflare(`/d1/database?name=${encodeURIComponent(databaseName)}&per_page=100`);
let database = databases.data.result?.find((item) => item.name === databaseName);
if (!database) {
  const created = await cloudflare('/d1/database', {
    method: 'POST',
    body: JSON.stringify({ name: databaseName, primary_location_hint: process.env.D1_LOCATION_HINT || 'enam' })
  });
  database = created.data.result;
  console.log(`D1 criado: ${databaseName}`);
} else {
  console.log(`D1 existente: ${databaseName}`);
}

const projectPath = `/pages/projects/${encodeURIComponent(pagesProjectName)}`;
const project = await cloudflare(projectPath, { method: 'GET' }, [200, 404]);
if (project.status === 404) {
  await cloudflare('/pages/projects', {
    method: 'POST',
    body: JSON.stringify({ name: pagesProjectName, production_branch: productionBranch })
  });
  console.log(`Pages criado: ${pagesProjectName}`);
} else {
  console.log(`Pages existente: ${pagesProjectName}`);
}

let r2Ready = false;
if (r2BucketName) {
  try {
    const bucketPath = `/r2/buckets/${encodeURIComponent(r2BucketName)}`;
    const bucket = await cloudflare(bucketPath, { method: 'GET' }, [200, 404]);
    if (bucket.status === 404) {
      await cloudflare('/r2/buckets', {
        method: 'POST',
        body: JSON.stringify({
          name: r2BucketName,
          locationHint: process.env.R2_LOCATION_HINT || 'enam',
          storageClass: 'Standard'
        })
      });
      console.log(`R2 criado: ${r2BucketName}`);
    } else {
      console.log(`R2 existente: ${r2BucketName}`);
    }
    r2Ready = true;
  } catch (error) {
    console.warn(`R2 não provisionado (${r2BucketName}). O deploy seguirá sem binding MEDIA. Motivo: ${error.message}`);
    console.warn('Para ativar mídia automática, o token Cloudflare precisa de Workers R2 Storage Write.');
  }
}

if (!database?.uuid) throw new Error('Cloudflare não retornou o UUID do D1.');
const values = {
  CLOUDFLARE_ACCOUNT_ID: accountId,
  D1_DATABASE_ID: database.uuid,
  PAGES_CANONICAL_URL: `https://${pagesProjectName}.pages.dev`,
  R2_READY: r2Ready ? '1' : '0'
};
if (r2Ready && r2BucketName) values.R2_BUCKET_NAME = r2BucketName;

if (process.env.GITHUB_ENV) {
  await appendFile(process.env.GITHUB_ENV, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
}
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `${Object.entries(values).map(([key, value]) => `${key.toLowerCase()}=${value}`).join('\n')}\n`);
}
console.log(`Recursos confirmados para ${databaseName}, ${pagesProjectName}${r2Ready ? ` e ${r2BucketName}` : ''}.`);
