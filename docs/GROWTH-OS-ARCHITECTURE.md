# Victor Hugo Growth OS

## Objetivo
Transformar o site profissional em uma plataforma integrada de autoridade, conteúdo, aquisição, CRM e inteligência de marketing.

## Princípio central
Uma pauta de alta qualidade deve gerar múltiplos ativos: artigo, post LinkedIn, carrossel Instagram, newsletter e peças visuais derivadas. Nesta fase, toda geração automática termina em `draft` ou `review`; publicação externa exige aprovação humana.

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
8. Publicador — planejado; dependerá de OAuth dos canais.
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
- Worker: API, autenticação, CRM, conteúdo, webhooks e orquestração
- Workers AI: geração editorial e visual
- D1: dados estruturados e auditoria dos agentes
- R2 `MEDIA`: imagens e demais ativos privados; binding só é ativado após provisionamento confirmado
- Futuro: Queues para publicação assíncrona
- Futuro: Cron Triggers para Radar, Analytics e sincronizações

## R2 e resiliência
Os deploys definem buckets separados:
- staging: `victor-simon-media-staging`
- produção: `victor-simon-media`

O bootstrap tenta consultar/criar o bucket. Se o token Cloudflare não possuir `Workers R2 Storage Write`, o deploy registra aviso, define `R2_READY=0` e segue sem binding `MEDIA`; site, CRM, blog e automação textual continuam funcionando. Quando o bucket é confirmado, `generate-wrangler-config.mjs` adiciona o binding automaticamente.

## Segurança
- Tokens de LinkedIn/Meta nunca entram no front-end ou no Git.
- Bucket R2 permanece privado nesta fase.
- A leitura de mídia do painel passa pela API autenticada.
- Conteúdos derivados entram como `draft`.
- Imagens geradas entram como `review`.
- Nenhum conteúdo é autopublicado em rede social sem aprovação humana.
- Logs de agentes não devem armazenar secrets nem dados pessoais desnecessários.
- Painel permanece noindex e autenticado.

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

### Próxima fase — homologação e social
1. CI completo do head
2. publicar em STAGING
3. validar Home, Blog, painel, D1, Workers AI e R2
4. OAuth LinkedIn
5. OAuth Meta/Instagram
6. fila de publicação e registro de IDs/URLs

### Growth Loop
- métricas por canal
- atribuição UTM
- leads por conteúdo/campanha
- Content Score
- recomendações automáticas
- dashboards de tendência e performance
