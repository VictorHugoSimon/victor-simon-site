# Site Victor Hugo Teixeira Simon

Aplicação bilíngue com site institucional, blog, painel restrito, API Cloudflare Worker e banco D1. O repositório possui CI/CD completo e idempotente para **staging** e **produção**.

## O que acontece automaticamente

- qualquer pull request para `staging` ou `main` executa testes, verificação estrutural e build;
- push em `staging` cria/confirma `vhs-db-staging` e `victor-simon-site-staging`, aplica migrações, publica o Worker e o Pages e executa smoke test;
- push em `main` repete o processo com `vhs-db`, `victor-simon-site` e o Worker de produção;
- o endereço real do Worker é injetado no site durante o pipeline;
- staging recebe `robots.txt` e `X-Robots-Tag` de bloqueio de indexação;
- migrações são versionadas e aplicadas antes do código da API.

## Fluxo de branches

```text
feature/* → pull request → staging → homologação → pull request → main → produção
```

## Única configuração manual obrigatória

Crie no GitHub os Environments `staging` e `production` e adicione em ambos:

| Secret | Conteúdo |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | ID da conta Cloudflare |
| `CLOUDFLARE_API_TOKEN` | Token com Workers Scripts Edit, D1 Edit e Pages Edit |
| `AUTH_SECRET` | String aleatória com pelo menos 32 caracteres |
| `ROBOT_KEY` | Chave aleatória para automações internas |
| `ADMIN_PASSWORD_HASH` | SHA-256 da senha administrativa |

Gere os três últimos valores localmente:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node scripts/hash-password.mjs "SUA-SENHA-COM-12-OU-MAIS-CARACTERES"
```

Não coloque valores secretos em arquivos, commits, issues ou logs.

## Execução local

```bash
npm ci
npm test
npm run verify
npm run build:staging
```

Para executar a API local com D1, copie `wrangler.example.jsonc` para um arquivo local ignorado, crie `.dev.vars` e use Wrangler 4.x.

## Publicação

1. Faça push do código inicial em `main`.
2. Crie a branch `staging` a partir de `main`.
3. Configure os secrets dos dois Environments.
4. Execute **Deploy STAGING** manualmente ou faça push em `staging`.
5. Valide a URL retornada pelo job.
6. Faça merge de `staging` em `main` para publicar produção.

O projeto Pages e o D1 são criados automaticamente se ainda não existirem.

## Segurança

- o painel não é linkado no site e possui `noindex`;
- autenticação ocorre no Worker com token HMAC de oito horas;
- senha não é armazenada no front-end;
- CORS é específico por ambiente;
- endpoints públicos possuem rate limit, limite de payload e validação;
- queries D1 usam prepared statements;
- credenciais vivem apenas nos secrets do GitHub/Cloudflare.

## Domínio

Depois do primeiro deploy de produção, associe `www.victorhugoteixeirasimon.com.br` ao projeto Pages `victor-simon-site` e configure o domínio raiz para redirecionar ao `www`. Essa etapa depende do acesso DNS do domínio.

Veja o checklist operacional em [`docs/DEPLOY-CHECKLIST.md`](docs/DEPLOY-CHECKLIST.md).
