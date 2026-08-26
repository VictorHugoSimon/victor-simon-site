# Site Victor Hugo Teixeira Simon

Aplicação bilíngue com site institucional, blog, painel restrito, API Cloudflare Worker e banco D1. O repositório possui CI/CD próprio para **staging** e **produção**.

## Isolamento obrigatório

Este projeto é independente de qualquer outro repositório, cliente ou ambiente.

- não reutilizar Secrets, workflows, bancos, Workers, Pages ou branches de outros projetos;
- não usar Instituto Államo ou qualquer outro projeto como ponte de deploy;
- todas as credenciais de produção devem pertencer ao próprio repositório `VictorHugoSimon/victor-simon-site`;
- nomes de recursos Cloudflare são exclusivos deste projeto.

## Ambientes

| Ambiente | Pages | Worker | D1 |
|---|---|---|---|
| STAGING | `victor-simon-site-staging.pages.dev` | `victor-simon-api-staging` | `vhs-db-staging` |
| PRODUÇÃO | `victor-hugo-teixeira-simon.pages.dev` | `victor-simon-api` | `vhs-db` |

A URL temporária oficial de produção é:

`https://victor-hugo-teixeira-simon.pages.dev`

O domínio `www.victorhugoteixeirasimon.com.br` fica reservado para associação futura quando voltar a estar disponível.

## O que acontece automaticamente

- qualquer pull request para `staging` ou `main` executa testes, verificação estrutural e build;
- push em `staging` publica o ambiente de homologação quando as credenciais próprias de `staging` estiverem configuradas;
- push em `main` verifica primeiro se existem credenciais próprias do Environment `production`;
- sem credenciais próprias, o deploy Cloudflare é ignorado com segurança, sem reaproveitar credenciais de outro projeto;
- com credenciais próprias, o pipeline cria/confirma recursos, aplica migrações, publica Worker e Pages e executa smoke test;
- o endereço real do Worker é injetado no site durante o pipeline;
- staging recebe `robots.txt` e `X-Robots-Tag` de bloqueio de indexação;
- migrações são versionadas e aplicadas antes do código da API.

## Fluxo de branches

```text
feature/* → pull request → staging/homologação → main → produção
```

## Configuração de credenciais

Crie no GitHub os Environments `staging` e `production` e adicione, diretamente no GitHub e nunca no chat:

| Secret | Conteúdo |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | ID da conta Cloudflare; opcional quando o token permite descoberta segura da conta |
| `CLOUDFLARE_API_TOKEN` | Token próprio deste projeto com Workers Scripts Edit, D1 Edit e Pages Edit |
| `ADMIN_PASSWORD` | Senha administrativa forte do Growth OS |

O pipeline deriva `AUTH_SECRET` e `ROBOT_KEY` com HMAC-SHA-256 e transforma `ADMIN_PASSWORD` em SHA-256 antes de enviar os valores ao Worker. Os valores derivados são mascarados nos logs e nunca entram no repositório.

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

1. Desenvolva em branch própria e abra PR.
2. Execute CI e Visual QA contra STAGING.
3. Homologue Home desktop/mobile, Blog e Growth OS.
4. Promova o código para `main`.
5. Quando o Environment `production` tiver credenciais próprias, o workflow **Deploy PRODUCTION** publica em `victor-hugo-teixeira-simon.pages.dev`.
6. Execute smoke test e QA da URL publicada.

O projeto Pages e o D1 são criados automaticamente se ainda não existirem.

## Segurança

- o painel não é linkado no site e possui `noindex`;
- autenticação ocorre no Worker com token HMAC de oito horas;
- senha não é armazenada no front-end;
- CORS é específico por ambiente;
- endpoints públicos possuem rate limit, limite de payload e validação;
- queries D1 usam prepared statements;
- credenciais vivem apenas nos Secrets do GitHub/Cloudflare deste projeto.

## Domínio oficial futuro

Quando `www.victorhugoteixeirasimon.com.br` estiver novamente disponível, associe-o ao projeto Pages `victor-hugo-teixeira-simon`. O endereço `pages.dev` deve continuar como contingência técnica.

Veja o checklist operacional em [`docs/DEPLOY-CHECKLIST.md`](docs/DEPLOY-CHECKLIST.md).
