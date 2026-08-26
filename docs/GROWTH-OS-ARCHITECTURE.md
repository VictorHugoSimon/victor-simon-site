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
- Futuro: Queues para publicação assíncrona/retry
- Cron Trigger diário implementado para fila de publicação + Radar + Estratégia + Analytics + Growth Coach

## R2 e resiliência
Os deploys definem buckets separados:
- staging: `victor-simon-media-staging`
- produção: `victor-simon-media`

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
- escopos atuais `instagram_business_basic` e `instagram_business_content_publish`;
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
- `GET /api/social/media/:assetId` — URL temporária assinada para fetch da Meta

## Deploy social opcional
Os deploys de STAGING/Produção aceitam, sem torná-los obrigatórios:
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `INSTAGRAM_CLIENT_ID`
- `INSTAGRAM_CLIENT_SECRET`

Se o par de um canal estiver completo, o pipeline grava os valores como Worker Secrets. Se estiver ausente, o deploy-base segue normalmente e o painel mostra o conector como não configurado.

## Gate de infraestrutura atual
A engenharia da branch não depende de credenciais sociais para passar CI. Para o deploy real na Cloudflare, o pipeline agora exige apenas:
- `CLOUDFLARE_API_TOKEN`
- `ADMIN_PASSWORD`

`CLOUDFLARE_ACCOUNT_ID` tornou-se **opcional**. O bootstrap consulta as contas acessíveis pelo token e escolhe automaticamente quando existe uma única conta ou quando encontra inequivocamente os recursos do projeto. Se houver múltiplas contas indistinguíveis, pode-se informar `CLOUDFLARE_ACCOUNT_ID` ou `CLOUDFLARE_ACCOUNT_NAME` para desambiguar. Para a descoberta automática, o token precisa conseguir listar as contas acessíveis.

Os últimos deploys reais de STAGING e produção, executados antes dessa melhoria, confirmaram que testes/builds passavam e paravam no gate de credenciais. O pipeline também foi corrigido para não sobrescrever `AUTH_SECRET`, `ROBOT_KEY` e `ADMIN_PASSWORD_HASH` derivados em runtime com GitHub Secrets vazios.

O conector GitHub disponível nesta sessão não expõe API de escrita de Secrets; portanto `CLOUDFLARE_API_TOKEN` e `ADMIN_PASSWORD` não podem ser criados por commit ou chamada do conector sem quebrar o modelo de segurança.

## Estado de validação
A fundação anterior possui histórico de `CI` e `Growth OS CI` verdes. O head atual acrescentou OAuth social, publicação aprovada, migration `0004`, descoberta automática da conta Cloudflare e hardening do deploy. Ele precisa de nova execução dos dois CIs antes de promoção. As mutações realizadas pelo conector não estão disparando Actions automaticamente nesta sessão; por isso o gate de homologação real permanece o `Deploy STAGING` manual após os dois secrets base estarem disponíveis.

## Roadmap atualizado
### Fundação — implementada na branch
- Home V2 fiel ao protótipo
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
- conector LinkedIn e publicação de texto aprovada
- conector Instagram e publicação de imagem aprovada
- workspace de conexão/publicação no painel
- descoberta automática de Account ID Cloudflare
- deploy social opcional e não bloqueante

### Próxima fase — homologação real
1. disponibilizar `CLOUDFLARE_API_TOKEN` e `ADMIN_PASSWORD` no GitHub Actions
2. executar CI/deploy de `staging`
3. aplicar migrations `0003` e `0004`
4. validar Home, Blog, painel, D1, Workers AI e R2
5. registrar os apps oficiais LinkedIn/Instagram com os redirect URIs retornados pelo Worker STAGING
6. disponibilizar os quatro secrets sociais
7. conectar contas reais e fazer publicações de teste aprovadas

### Growth Loop V1 — implementado
- fila D1 de publicação agendada com retry controlado e gate de aprovação
- ingestão de métricas por canal
- atribuição UTM + IDs internos por sessão
- first/last touch associado ao lead
- Content Score 0–100
- Radar, Estrategista, Pesquisador, Analytics e Growth Coach
- painel de performance, atribuição e ciclos

### Evoluções dependentes de provedores
- sincronização automática de métricas sociais conforme permissões concedidas
- calibração dos pesos do Content Score com histórico real
- Cloudflare Queues opcional para volumes maiores
