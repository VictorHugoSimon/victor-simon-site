# Victor Hugo Growth Loop V1

## Objetivo
Fechar o ciclo do Growth OS para que conteúdo, aquisição e aprendizado sejam tratados como um sistema único:

`Radar → Estratégia → Pesquisa → Conteúdo → Aprovação → Distribuição → Métricas → Atribuição → Aprendizado`.

A implementação mantém a regra central do produto: **nenhum agente publica conteúdo externo sem aprovação humana prévia**.

## O que está implementado

### 1. Radar
- cria pautas no `content_ideas`;
- pode receber sinais/fontes por API;
- quando não há sinais externos, identifica lacunas dos pilares editoriais;
- Workers AI pode transformar sinais em pautas estruturadas;
- evita duplicar título já existente.

### 2. Estrategista
- reavalia pautas em backlog/seleção/pesquisa;
- considera histórico do pilar, evidência de pesquisa e recência;
- grava score e rationale técnico em `metadata_json`;
- não publica nem aprova conteúdo.

### 3. Pesquisador
- recebe uma pauta e uma fonte HTTPS;
- rejeita URLs locais/privadas óbvias para reduzir risco de SSRF;
- lê somente tipos textuais/JSON/XML e limita o volume ingerido;
- Workers AI resume a fonte, extrai fatos e registra confidence;
- resultado entra em `research_notes` com status `review`.

### 4. Editorial Writer / Repurposer / Art Director
Já existentes no Growth OS e preservados:
- Writer gera draft via Workers AI;
- Repurposer deriva LinkedIn, Instagram e newsletter como drafts;
- Art Director gera mídia via FLUX e envia para revisão;
- aprovações continuam obrigatórias antes de distribuição.

### 5. Publicação agendada e retry
`publication_jobs` implementa fila durável em D1.

Regras:
- somente conteúdo com `approved_at` e status `approved`/`scheduled` pode ser enfileirado;
- o cron detecta conteúdo `scheduled` vencido e cria jobs automaticamente;
- canais automáticos nesta fase: LinkedIn e Instagram;
- usa os publishers oficiais já implementados em `social.mjs`;
- sucesso → `completed`;
- resposta externa em processamento → `processing` sem repetição agressiva;
- credencial ausente/expirada ou validação → `blocked_external`;
- falhas temporárias → `retry` exponencial;
- ao atingir `max_attempts` → `failed`;
- job concluído não pode ser reenfileirado.

### 6. Analytics e Content Score
Métricas podem ser ingeridas por API, manualmente pelo painel ou futuramente pelos conectores oficiais.

O Content Score é de 0 a 100 e combina:
- alcance: 15%;
- engajamento: 20%;
- tráfego/cliques: 15%;
- leads/reuniões: 20%;
- SEO: 10%;
- conversão: 20%.

O cálculo usa normalizações e limites para evitar que um único número distorça todo o score. Ausência total de métricas retorna score 0.

### 7. Atribuição
O site e o Blog capturam:
- `utm_source`;
- `utm_medium`;
- `utm_campaign`;
- `utm_term`;
- `utm_content`;
- `vh_content`;
- `vh_publication`;
- `vh_campaign`;
- session ID anônimo armazenado em `sessionStorage`.

O Growth Loop grava touches em `attribution_touches`. Quando o formulário cria um lead, o Worker associa os touches da sessão e consolida:
- first touch;
- last touch;
- origem;
- conteúdo;
- campanha.

Isso permite evoluir para leituras como:
`Post LinkedIn → visita → lead → reunião → proposta → cliente`.

### 8. Growth Coach
Analisa os últimos 30 dias de:
- performance por canal;
- backlog editorial;
- funil de leads.

Gera recomendações acionáveis e grava em `growth_recommendations`. Recomendações anteriores do mesmo grupo são marcadas como superseded para não acumular ruído operacional.

### 9. Ciclos e auditoria
Cada execução completa gera um registro em `growth_cycles`.
Todos os agentes mantêm auditoria em `agent_runs`.

## Novas entidades D1
Migration `0005_growth_loop.sql`:
- `research_notes`;
- `attribution_touches`;
- `lead_attribution`;
- `content_performance_daily`;
- `publication_jobs`;
- `growth_cycles`.

A migration é aditiva e não contém `DROP`, `TRUNCATE` ou exclusões destrutivas.

## APIs do Growth Loop

### Atribuição pública
- `POST /api/growth-loop/touch`
  - CORS restrito às origens configuradas;
  - rate-limit por IP/janela;
  - não exige autenticação porque é telemetria pública do site.

### Métricas e inteligência — admin
- `POST /api/growth-loop/metrics`
- `GET /api/growth-loop/summary`
- `GET /api/growth-loop/research`
- `POST /api/growth-loop/research`
- `GET /api/growth-loop/cycles`
- `POST /api/growth-loop/radar`
- `POST /api/growth-loop/strategist`
- `POST /api/growth-loop/analytics`
- `POST /api/growth-loop/coach`
- `POST /api/growth-loop/run`

### Automação interna
- `POST /api/growth-loop/robot/run` — requer `ROBOT_KEY`.

### Fila de publicação
- `GET /api/publication-jobs`
- `POST /api/publication-jobs`
- `POST /api/publication-jobs/run`
- `POST /api/publication-jobs/:id/requeue`

## Painel Growth OS
A interface administrativa recebe a nova área **Growth Loop** com:
- KPIs de Content Score, impressões, cliques, leads, reuniões e receita atribuída;
- top conteúdos dos últimos 30 dias;
- origem first-touch dos leads;
- execução manual de Radar, Estrategista, Analytics e Growth Coach;
- formulário de ingestão de métricas;
- formulário do Pesquisador;
- auditoria dos ciclos recentes.

## Cron
O Worker utiliza `scheduled()` com cron configurado pelo Wrangler.

Defaults:
- produção: `17 11 * * *` UTC;
- staging: `47 11 * * *` UTC.

Pode ser substituído pela variável não secreta `GROWTH_CRON`.

Ordem do ciclo agendado:
1. processar fila de publicações aprovadas/agendadas;
2. Radar;
3. Estrategista;
4. Analytics / recomputar scores;
5. Growth Coach.

## Segurança
- nenhum token social entra no front-end ou Git;
- publicação externa continua passando pelo cofre de credenciais existente;
- conteúdo não aprovado não entra na fila;
- pesquisador limita protocolo/tipo/tamanho de fonte;
- telemetria pública possui CORS e rate-limit;
- painel e endpoints de gestão continuam autenticados;
- cron não transforma draft em approved;
- falhas externas não liberam bypass de aprovação.

## Ativação externa ainda necessária
A engenharia fica pronta no repositório e no pipeline, mas a ativação real depende de recursos que não podem ser inventados nem gravados em Git:

1. GitHub Environment/Secrets próprios do `victor-simon-site`:
   - `CLOUDFLARE_API_TOKEN`;
   - `ADMIN_PASSWORD`.
2. Para publicação social real, quando desejado:
   - `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`;
   - `INSTAGRAM_CLIENT_ID` / `INSTAGRAM_CLIENT_SECRET`;
   - aprovação/permissões dos apps oficiais nas plataformas.
3. Métricas automáticas de redes sociais dependem das permissões de analytics concedidas pelos provedores. Até lá, o Growth Loop aceita ingestão manual/API sem fabricar dados.

## Critério de conclusão técnica
Growth Loop V1 é considerado tecnicamente concluído quando:
- migrations e builds passam no CI;
- Worker entry importa core + Growth Loop + fila;
- site e Blog preservam UX e passam QA visual;
- aprovação humana continua protegida;
- PR é integrada ao `main` por squash;
- `staging` é sincronizado ao mesmo commit.

A publicação efetiva na Cloudflare só é considerada concluída quando as credenciais próprias do projeto existirem e o deploy real for validado; o pipeline não reutiliza recursos ou secrets de outros projetos.
