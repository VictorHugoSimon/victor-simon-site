# Checklist operacional de deploy

## 1. Isolamento

- [ ] Usar somente o repositório `VictorHugoSimon/victor-simon-site`.
- [ ] Não reutilizar Secrets, workflows, bancos, Workers ou Pages de qualquer outro projeto.
- [ ] Confirmar nomes exclusivos: `victor-simon-site-staging` no STAGING e `victor-hugo-teixeira-simon` em PRODUÇÃO.

## 2. Cloudflare

- [ ] Criar token customizado limitado à conta correta e exclusivo deste projeto.
- [ ] Permissões do token: Workers Scripts Edit, D1 Edit e Cloudflare Pages Edit.
- [ ] Copiar o Account ID quando necessário; o bootstrap também suporta descoberta segura com token próprio.
- [ ] Confirmar que `workers.dev` está habilitado na conta.

O pipeline cria/confirma bancos e projetos Pages. Não é necessário compartilhar infraestrutura de outro sistema.

## 3. GitHub

- [ ] Criar Environments `staging` e `production`.
- [ ] Cadastrar os Secrets descritos no README diretamente no GitHub.
- [ ] Em `production`, habilitar aprovação obrigatória se desejar uma trava humana antes da publicação.
- [ ] Proteger `main`: exigir pull request e CI verde.

## 4. Publicação

- [ ] Executar o workflow `Deploy STAGING`.
- [ ] Confirmar D1, Worker, Pages e smoke test verdes.
- [ ] Validar `https://victor-simon-site-staging.pages.dev`.
- [ ] Validar formulário, login do painel, Blog, PT/EN e responsividade.
- [ ] Fazer merge em `main`.
- [ ] Confirmar que `Deploy PRODUCTION` publica somente quando houver credenciais próprias.
- [ ] Validar `https://victor-hugo-teixeira-simon.pages.dev` e confirmar que contém a mesma versão homologada.

## 5. Domínio oficial futuro

- [ ] Quando o domínio voltar a estar disponível, associar `www.victorhugoteixeirasimon.com.br` ao Pages `victor-hugo-teixeira-simon`.
- [ ] Ajustar nameservers no Registro.br somente se a zona ainda não estiver na Cloudflare.
- [ ] Redirecionar o domínio raiz para `www`.
- [ ] Validar HTTPS e certificado.
- [ ] Manter `victor-hugo-teixeira-simon.pages.dev` como contingência técnica.

## 6. Pós-deploy

- [ ] Testar `GET /api/health` no Worker.
- [ ] Enviar um lead de teste e conferir no painel.
- [ ] Cadastrar GA4 e GTM quando os IDs estiverem disponíveis.
- [ ] Verificar o domínio no Search Console e enviar `/sitemap.xml`.
- [ ] Trocar a senha administrativa sempre que houver suspeita de exposição.
- [ ] Manter Meta/WhatsApp desabilitado até a verificação do negócio e a configuração dos Secrets específicos.

## Critério de rollback

Interrompa a promoção para produção se ocorrer qualquer uma destas situações:

- migração D1 falha;
- `/api/health` não retorna `status: ok`;
- o site contém o marcador `__API_BASE__`;
- formulário ou autenticação retornam erro de CORS;
- staging não possui bloqueio de indexação;
- produção não corresponde visual e funcionalmente à versão homologada.

Worker possui histórico de versões na Cloudflare. Pages mantém cada deployment imutável; uma versão anterior pode ser republicada pelo painel enquanto o commit é corrigido.

Para reverter o Worker, abra **Actions → Rollback Worker**, selecione o ambiente e informe o ID exato de uma versão anterior. O rollback do código não desfaz migrações D1; mudanças de schema exigem uma migração corretiva própria.
