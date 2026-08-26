# Growth OS V2 — Status de Homologação

## Implementado
- Home V2 e blog funcional;
- painel Growth OS;
- workflow editorial D1 + aprovação humana;
- Editorial Writer via Workers AI;
- Social Repurposer;
- Art Director via FLUX + R2 privado opcional;
- OAuth seguro LinkedIn/Instagram com tokens AES-GCM;
- publicação manual de conteúdo aprovado;
- migrations aditivas `0003` e `0004`;
- CI e verificações contra migrations destrutivas;
- descoberta automática de Cloudflare Account ID;
- deploy corrigido para preservar secrets internos derivados;
- deploy social opcional: cada canal é ativado apenas quando seu par Client ID/Client Secret estiver disponível.

## Gate externo restante
Para executar homologação real em Cloudflare são necessários no GitHub Actions:
- `CLOUDFLARE_API_TOKEN`
- `ADMIN_PASSWORD`

`CLOUDFLARE_ACCOUNT_ID` é opcional e normalmente será descoberto automaticamente.

Para ativar as integrações depois do deploy-base:
- LinkedIn: `LINKEDIN_CLIENT_ID` + `LINKEDIN_CLIENT_SECRET`;
- Instagram: `INSTAGRAM_CLIENT_ID` + `INSTAGRAM_CLIENT_SECRET`.

## Produção
`main` não deve receber esta versão antes de STAGING executar migrations, Worker/AI/R2, Pages e smoke tests com sucesso.
