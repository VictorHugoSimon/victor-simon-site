# Checklist operacional de deploy

## 1. Cloudflare

- [ ] Criar token customizado limitado à conta correta.
- [ ] Permissões do token: Workers Scripts Edit, D1 Edit e Cloudflare Pages Edit.
- [ ] Copiar o Account ID.
- [ ] Confirmar que `workers.dev` está habilitado na conta.

O pipeline cria os bancos e os projetos Pages. Não é necessário criá-los manualmente.

## 2. GitHub

- [ ] Criar Environments `staging` e `production`.
- [ ] Cadastrar os três secrets descritos no README.
- [ ] Em `production`, habilitar aprovação obrigatória se desejar uma trava humana antes da publicação.
- [ ] Proteger `main`: exigir pull request e CI verde.

## 3. Primeira publicação

- [ ] Executar o workflow `Deploy STAGING`.
- [ ] Confirmar que os jobs de D1, Worker, Pages e smoke test ficaram verdes.
- [ ] Abrir a URL de staging exibida no GitHub Deployment.
- [ ] Validar formulário, login do painel, blog, alternância PT/EN e responsividade.
- [ ] Fazer merge em `main`.
- [ ] Confirmar `Deploy PRODUCTION` verde.

## 4. Domínio

- [ ] Associar `www.victorhugoteixeirasimon.com.br` a `victor-simon-site` no Cloudflare Pages.
- [ ] Ajustar nameservers no Registro.br somente se a zona ainda não estiver na Cloudflare.
- [ ] Redirecionar o domínio raiz para `www`.
- [ ] Validar HTTPS e certificado.

## 5. Pós-deploy

- [ ] Testar `GET /api/health` no Worker.
- [ ] Enviar um lead de teste e conferir no painel.
- [ ] Cadastrar GA4 e GTM quando os IDs estiverem disponíveis.
- [ ] Verificar o domínio no Search Console e enviar `/sitemap.xml`.
- [ ] Trocar a senha administrativa sempre que houver suspeita de exposição.
- [ ] Manter Meta/WhatsApp desabilitado até a verificação do negócio e a configuração dos secrets específicos.

## Critério de rollback

Interrompa a promoção para produção se ocorrer qualquer uma destas situações:

- migração D1 falha;
- `/api/health` não retorna `status: ok`;
- o site contém o marcador `__API_BASE__`;
- formulário ou autenticação retornam erro de CORS;
- staging não possui bloqueio de indexação.

Worker possui histórico de versões na Cloudflare. Pages mantém cada deployment imutável; uma versão anterior pode ser republicada pelo painel enquanto o commit é corrigido.

Para reverter o Worker, abra **Actions → Rollback Worker**, selecione o ambiente e informe o ID exato de uma versão anterior. O rollback do código não desfaz migrações D1; mudanças de schema exigem uma migração corretiva própria.
