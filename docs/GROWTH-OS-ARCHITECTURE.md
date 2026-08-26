# Victor Hugo Growth OS

## Objetivo
Transformar o site profissional em uma plataforma integrada de autoridade, conteúdo, aquisição, CRM e inteligência de marketing.

## Princípio central
Uma pauta de alta qualidade deve gerar múltiplos ativos: artigo, post LinkedIn, carrossel Instagram, newsletter e peças visuais derivadas. Toda geração automática termina em `draft` ou `review`. Publicação externa exige conteúdo aprovado e uma conta oficial conectada.

## Canais
- Site / landing pages
- Blog / SEO
- LinkedIn
- Instagram
- Newsletter
- WhatsApp / contato

## Agentes
1. Radar — **implementado no Growth Loop V1**; cria pautas a partir de sinais fornecidos ou lacunas editoriais.
2. Estrategista — **implementado no Growth Loop V1**; reavalia pautas por histórico do pilar, evidência e recência.
3. Pesquisador — **implementado no Growth Loop V1**; lê fonte HTTPS, resume fatos e grava evidência para revisão.
4. Editorial Writer — **implementado** com Workers AI; cria rascunhos de conteúdo.
5. Social Repurposer — **implementado**; transforma um conteúdo-base em drafts de LinkedIn, Instagram e newsletter.
6. Art Director — **implementado**; gera imagem conceitual com FLUX e grava em R2 privado como `review`.
7. Revisor — fluxo humano **implementado** via aprovação/rejeição de conteúdo e mídia.
8. Publicador — **implementado na fundação** para LinkedIn e Instagram; só publica conteúdo aprovado e depende de OAuth oficial conectado.
9. Analytics / Growth Coach — **implementados no Growth Loop V1** com Content Score, performance de 30 dias e recomendações.

## Pilares editoriais
- PMO & Governança
- Produto & Delivery
- IA & Automação
- Transformação Digital
- Dados & Inteligência de Mercado
- AgTech / Empreendedorismo, de forma seletiva

## Estados editoriais
backlog -> researching/draft -> review -> approved -> scheduled -> published -> measured

## Estados de mídia
review -> approved | rejected -> archived

## Content Score
Score de 0 a 100 calculado por combinação ponderada de alcance, engajamento, autoridade, tráfego, leads, SEO e conversão. Pesos serão calibrados após os primeiros ciclos reais.

## Arquitetura Cloudflare
- Pages: site, blog e painel
- Worker: API, autenticação, CRM, conteúdo, OAuth, publicação e orquestração
- Workers AI: geração editorial e visual
- D1: dados estruturados, auditoria dos agentes, estados OAuth e credenciais sociais criptografadas
- R2 `MEDIA`: imagens e demais ativos privados; binding só é ativado após provisionamento confirmado
- Cron Trigger diário: fila de publicação + Radar + Estratégia + Analytics + Growth Coach
- Cloudflare Queues permanece evolução opcional para volumes maiores

## Recursos por ambiente
### STAGING
- Pages: `victor-simon-site-staging`
- Worker: `victor-simon-api-staging`
- D1: `vhs-db-staging`
- R2: `victor-simon-media-staging`

### PRODUÇÃO
- Pages: `victor-hugo-teixeira-simon`
- Worker: `victor-simon-api`
- D1: `vhs-db`
- R2: `victor-simon-media`

## R2 e resiliência
O bootstrap tenta consultar/criar o bucket. Se o token Cloudflare não possuir `Workers R2 Storage Write`, o deploy registra aviso, define `R2_READY=0` e segue sem binding `MEDIA`; site, CRM, blog e automação textual continuam funcionando. Quando o bucket é confirmado, `generate-wrangler-config.mjs` adiciona o binding automaticamente.

## OAuth social
### LinkedIn
- fluxo OAuth 2.0 de três pernas;
- escopos `openid`, `profile` e `w_member_social`;
- publicação via `POST https://api.linkedin.com/rest/posts`;
- versão fixada por `LINKEDIN_API_VERSION`, padrão `202604`;
- publicação exige conteúdo em `approved` ou `scheduled`.

### Instagram
- Instagram Login para conta profissional;
- escopos `instagram_business_basic` e `instagram_business_content_publish`;
- Graph API configurável por `META_API_VERSION`, padrão `v26.0`;
- tenta trocar o token inicial por long-lived token e possui endpoint de refresh;
- publicação exige conteúdo aprovado e imagem aprovada vinculada;
- como o bucket R2 é privado, a API cria uma URL assinada temporária para a Meta buscar a imagem durante a criação do container.

## Segurança social
- Client secrets e access tokens nunca entram no front-end ou no Git.
- Access/refresh tokens são criptografados no D1 com AES-GCM usando chave derivada de `AUTH_SECRET`.
- OAuth `state` é aleatório, armazenado apenas como SHA-256, expira e é consumido uma única vez.
- Callbacks não exibem tokens.
- `/api/social/status` não devolve tokens.
- Desconectar uma conta remove as credenciais criptografadas.
- Publicação externa exige aprovação humana.
- Instagram exige mídia aprovada.
- URLs públicas de mídia são HMAC-assinadas e temporárias.

## Segurança geral
- Bucket R2 permanece privado.
- A leitura normal da biblioteca de mídia passa pela API autenticada.
- Conteúdos derivados entram como `draft`.
- Imagens geradas entram como `review`.
- Logs de agentes não devem armazenar secrets nem dados pessoais desnecessários.
- Painel permanece `noindex` e autenticado.
- Nenhum Secret, Worker, D1, Pages ou workflow de outro projeto pode ser reutilizado.

## Endpoints principais
### Editorial
- `GET/POST /api/growth/ideas`
- `GET/POST/PATCH /api/growth/content`
- `POST /api/growth/content/:id/decision`
- `POST /api/growth/generate`
- `GET /api/growth/calendar`

### Automação
- `POST /api/growth/content/:id/repurpose`
- `GET /api/growth/media`
- `POST /api/growth/media/generate`
- `GET /api/growth/media/:id/file`
- `PATCH /api/growth/media/:id`

### Growth Loop
- `POST /api/growth-loop/touch`
- `POST /api/growth-loop/metrics`
- `GET /api/growth-loop/summary`
- `GET/POST /api/growth-loop/research`
- `GET /api/growth-loop/cycles`
- `POST /api/growth-loop/radar`
- `POST /api/growth-loop/strategist`
- `POST /api/growth-loop/analytics`
- `POST /api/growth-loop/coach`
- `POST /api/growth-loop/run`
- `POST /api/growth-loop/robot/run`
- `GET/POST /api/publication-jobs`
- `POST /api/publication-jobs/run`
- `POST /api/publication-jobs/:id/requeue`

### Social
- `GET /api/social/status`
- `POST /api/social/linkedin/connect`
- `GET /api/social/linkedin/callback`
- `POST /api/social/linkedin/publish`
- `POST /api/social/instagram/connect`
- `GET /api/social/instagram/callback`
- `POST /api/social/instagram/publish`
- `POST /api/social/instagram/refresh`
- `POST /api/social/accounts/:id/disconnect`
- `GET /api/social/media/:assetId`

## Deploy social opcional
Os deploys de STAGING/Produção aceitam, sem torná-los obrigatórios:
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `INSTAGRAM_CLIENT_ID`
- `INSTAGRAM_CLIENT_SECRET`

Se o par de um canal estiver completo, o pipeline grava os valores como Worker Secrets. Se estiver ausente, o deploy-base segue normalmente e o painel mostra o conector como não configurado.

## Gate de infraestrutura atual
Para o deploy real na Cloudflare, o único Secret obrigatório é:
- `CLOUDFLARE_API_TOKEN`

Secrets opcionais:
- `ADMIN_PASSWORD` — quando ausente, o deploy continua e uma senha aleatória descartável é usada apenas para gerar `ADMIN_PASSWORD_HASH`; o plaintext não é salvo nem exibido e o login administrativo permanece efetivamente bloqueado até novo deploy com senha configurada.
- `CLOUDFLARE_ACCOUNT_ID` — opcional; o bootstrap consulta as contas acessíveis pelo token e tenta selecionar a conta de forma segura.
- `CLOUDFLARE_ACCOUNT_NAME` — alternativa opcional para desambiguação quando necessário.

O pipeline deriva `AUTH_SECRET` e `ROBOT_KEY` em runtime sem gravar os valores no Git. Também evita sobrescrever secrets internos derivados com entradas vazias.

## Estado operacional verificado em 26/08/2026
- Growth Loop V1 integrado e testado.
- Gate de deploy reduzido para um único Secret obrigatório.
- `main` e `staging` são mantidos alinhados no mesmo release após promoção.
- GitHub Actions de STAGING e PRODUÇÃO executaram o readiness check com `HAS_TOKEN: false`.
- Por isso os jobs `Testar, migrar e publicar staging` e `Testar, migrar e publicar produção` foram corretamente pulados.
- Nenhum recurso de outro projeto foi utilizado para contornar o gate.

Assim que `CLOUDFLARE_API_TOKEN` for cadastrado diretamente nos Environments `staging` e `production`, os workflows estão prontos para executar bootstrap, migrations `0001`–`0005`, Worker, Pages e smoke test. `ADMIN_PASSWORD` pode ser cadastrada depois para liberar o login administrativo.

## Estado da engenharia
### Fundação — implementada
- Home Clean V3/V3.1
- SEO social e acessibilidade
- painel Growth OS
- schema D1 de conteúdo, mídia, campanhas, agentes e métricas
- blog com leitura completa e fallback
- CRUD de pautas e conteúdo
- aprovação/reprovação
- calendário editorial
- Editorial Writer
- Social Repurposer
- Art Director com FLUX
- R2 privado opcional e resiliente
- biblioteca de mídia no painel
- OAuth state seguro e cofre criptografado de credenciais sociais
- LinkedIn e Instagram preparados para publicação aprovada
- descoberta automática de Account ID Cloudflare
- deploy social opcional e não bloqueante

### Growth Loop V1 — implementado
- fila D1 de publicação agendada com retry controlado e gate de aprovação
- ingestão de métricas por canal
- atribuição UTM + IDs internos por sessão
- first/last touch associado ao lead
- Content Score 0–100
- Radar, Estrategista, Pesquisador, Analytics e Growth Coach
- painel de performance, atribuição e ciclos
- cron diário

### Ativação operacional pendente
1. cadastrar `CLOUDFLARE_API_TOKEN` no Environment `staging`;
2. executar/validar Deploy STAGING real;
3. validar migration `0005`, Worker, Pages, Home, Blog e Painel;
4. cadastrar o mesmo token próprio no Environment `production`;
5. executar/validar Deploy PRODUCTION real;
6. cadastrar `ADMIN_PASSWORD` quando o login administrativo precisar ser liberado;
7. cadastrar credenciais OAuth sociais somente quando os apps oficiais estiverem autorizados.

### Evoluções dependentes de provedores
- sincronização automática de métricas sociais conforme permissões concedidas
- calibração dos pesos do Content Score com histórico real
- Cloudflare Queues opcional para volumes maiores
