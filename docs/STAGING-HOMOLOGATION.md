# STAGING — Growth OS V2

Objetivo: homologar a fundação completa sem tocar em produção.

## Pré-requisitos mínimos
GitHub Actions:
- `CLOUDFLARE_API_TOKEN`
- `ADMIN_PASSWORD`

Opcional:
- `CLOUDFLARE_ACCOUNT_ID` ou `CLOUDFLARE_ACCOUNT_NAME` se o token acessar múltiplas contas que não possam ser diferenciadas automaticamente.
- `LINKEDIN_CLIENT_ID` + `LINKEDIN_CLIENT_SECRET` para ativar LinkedIn.
- `INSTAGRAM_CLIENT_ID` + `INSTAGRAM_CLIENT_SECRET` para ativar Instagram.

## Pipeline esperado
1. `npm run ci`;
2. identificar conta Cloudflare;
3. confirmar/criar D1, Pages e R2 opcional;
4. aplicar migrations `0003_growth_os.sql` e `0004_social_oauth.sql`;
5. publicar Worker com D1 + Workers AI + R2 quando disponível;
6. aplicar secrets OAuth opcionais;
7. build Pages `noindex`;
8. publicar STAGING;
9. smoke test.

## Homologação funcional
- Home V2;
- Blog;
- login do painel;
- Nova pauta;
- Editorial Writer;
- revisão/aprovação;
- Social Repurposer;
- Art Director/R2 quando disponível;
- biblioteca de mídia;
- status dos conectores sociais;
- após registrar apps oficiais, OAuth LinkedIn/Instagram e publicação de teste com conteúdo aprovado.

Não promover para `main` antes da conclusão deste checklist.
