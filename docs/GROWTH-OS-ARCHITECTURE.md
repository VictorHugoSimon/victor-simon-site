# Victor Hugo Growth OS

## Objetivo
Transformar o site profissional em uma plataforma integrada de autoridade, conteúdo, aquisição, CRM e inteligência de marketing.

## Princípio central
Uma pauta de alta qualidade deve gerar múltiplos ativos: artigo, post LinkedIn, carrossel, legenda Instagram, roteiro de vídeo, newsletter e peças derivadas. Todo conteúdo passa por revisão humana antes de publicação automática até que o nível de confiança seja elevado.

## Canais
- Site / landing pages
- Blog / SEO
- LinkedIn
- Instagram
- Newsletter
- WhatsApp / contato

## Agentes
1. Radar — tendências, temas e oportunidades.
2. Estrategista — priorização por pilar, autoridade e negócio.
3. Pesquisador — fontes, fatos, dados e contexto.
4. Blog Writer — artigo, SEO, CTA e estrutura editorial.
5. Social Repurposer — LinkedIn, Instagram, carrossel e roteiro.
6. Revisor — marca, fatos, confidencialidade e qualidade.
7. Publicador — agendamento, publicação e registro de URL/ID.
8. Analytics — métricas e Content Score.
9. Growth Coach — recomendações para o próximo ciclo.

## Pilares editoriais
- PMO & Governança
- Produto & Delivery
- IA & Automação
- Transformação Digital
- Dados & Inteligência de Mercado
- AgTech / Empreendedorismo, de forma seletiva

## Estados editoriais
backlog -> researching -> drafting -> review -> approved -> scheduled -> published -> measured

## Content Score
Score de 0 a 100 calculado por combinação ponderada de alcance, engajamento, autoridade, tráfego, leads, SEO e conversão. Pesos serão calibrados após os primeiros ciclos reais.

## Arquitetura Cloudflare
- Pages: site, blog e painel
- Worker: API, autenticação, CRM, conteúdo, webhooks e orquestração
- D1: dados estruturados
- R2: mídia, imagens, carrosséis, PDFs e vídeos
- Queues: geração/publicação assíncrona
- Cron Triggers: Radar, Analytics e rotinas de sincronização

## Segurança
- Tokens de LinkedIn/Meta nunca entram no front-end ou no Git.
- Aprovação humana obrigatória para conteúdo antes de automação de publicação na fase inicial.
- Logs de agentes não devem armazenar secrets nem dados pessoais desnecessários.
- Painel permanece noindex e autenticado.

## Roadmap
### Sprint 1 — Fundação
- Home V2 fiel ao protótipo
- painel Growth OS
- schema D1 de conteúdo, mídia, campanhas, agentes e métricas
- blog com fallback funcional

### Sprint 2 — CMS e workflow
- CRUD de pautas e conteúdos
- aprovação/reprovação
- calendário editorial
- Content Score inicial
- biblioteca de mídia

### Sprint 3 — Agentes
- Radar
- Pesquisador
- Writer
- Repurposer
- Revisor
- geração de briefing de imagem

### Sprint 4 — Social
- OAuth LinkedIn
- OAuth Meta/Instagram
- publicação por fila
- captura de IDs, URLs e status

### Sprint 5 — Analytics & Growth Loop
- métricas por canal
- atribuição UTM
- leads por conteúdo/campanha
- recomendações automáticas
- dashboards de performance e tendência
