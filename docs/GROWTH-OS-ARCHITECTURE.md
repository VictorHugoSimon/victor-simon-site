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
1. Radar — tendências, temas e oportunidades. Planejado.
2. Estrategista — priorização por pilar, autoridade e negócio. Planejado.
3. Pesquisador — fontes, fatos, dados e contexto. Planejado.
4. Editorial Writer — **implementado** com Workers AI; cria rascunhos de conteúdo.
5. Social Repurposer — **implementado**; transforma um conteúdo-base em drafts de LinkedIn, Instagram e newsletter.
6. Art Director — **implementado**; gera imagem conceitual com FLUX e grava em R2 privado como `review`.
7. Revisor — fluxo humano **implementado** via aprovação/rejeição de conteúdo e mídia.
8. Publicador — **implementado na fundação** para LinkedIn e Instagram; só publica conteúdo aprovado e depende de OAuth oficial conectado.
9. Analytics / Growth Coach — planejados para o ciclo de métricas e otimização.

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
- Futuro: Cron Triggers para Radar, Analytics, refresh e sincronizações

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

### Próxima fase — homologação real
1. disponibilizar credenciais Cloudflare no GitHub Actions
2. CI completo do head
3. publicar em STAGING
4. aplicar migrations `0003` e `0004`
5. validar Home, Blog, painel, D1, Workers AI e R2
6. registrar os apps oficiais LinkedIn/Instagram com os redirect URIs do Worker STAGING
7. disponibilizar os quatro secrets sociais
8. conectar contas reais e fazer publicações de teste aprovadas

### Growth Loop
- status/retry assíncrono de publicação
- métricas por canal
- atribuição UTM
- leads por conteúdo/campanha
- Content Score
- recomendações automáticas
- dashboards de tendência e performance
