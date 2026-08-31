# Máquina Comercial — Agentes V2

## Objetivo

Manter uma operação comercial contínua que descubra empresas, pesquise evidências públicas, encontre canais e decisores publicados em sites oficiais, qualifique sinais e prepare abordagens para revisão humana.

## Agentes ativos

- Market Scout: descobre novas empresas em fontes públicas permitidas e cria contas/campanhas automaticamente.
- Researcher: pesquisa site oficial e fontes públicas associadas à empresa.
- Decision Maker Researcher: procura páginas públicas de liderança, governança, gestão e contato no mesmo domínio oficial.
- Intent Monitor: requalifica contas quando surgem sinais públicos mais recentes que o último score.
- Qualifier: calcula ICP fit, intenção, engajamento, autoridade e timing.
- Personalizer: cria uma abordagem individual somente quando existe canal público e score suficiente.

## Política de contato

Nenhum agente envia outbound automaticamente. Mensagens ficam como draft e exigem aprovação humana. Opt-out/consentimento negado bloqueia o contato.

## Frequência

GitHub Actions aciona a manutenção e a fila comercial duas vezes por hora. A execução usa lotes limitados e timeout de rede.

## Fonte inicial de descoberta contínua

Hub UniAgro, página pública de empresas membro. A fonte pode ser ampliada posteriormente com outras listas públicas legítimas.

## Funil

Fonte pública -> empresa descoberta -> Researcher -> decisores/canais públicos -> Qualifier -> Personalizer -> revisão humana -> oportunidade -> proposta -> follow-up -> negociação -> ganho/perdido.
