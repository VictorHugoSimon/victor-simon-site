# Checklist operacional de deploy

## 1. Isolamento

- [ ] Usar somente o repositório `VictorHugoSimon/victor-simon-site`.
- [ ] Não reutilizar Secrets, workflows, bancos, Workers ou Pages de qualquer outro projeto.
- [ ] Confirmar nomes exclusivos: `victor-simon-site-staging` no STAGING e `victor-hugo-teixeira-simon` em PRODUÇÃO.

## 2. Cloudflare

- [ ] Criar token customizado limitado à conta correta e exclusivo deste projeto.
- [ ] Permissões do token: Workers Scripts Edit, D1 Edit, Cloudflare Pages Edit e, quando desejado, Workers R2 Storage/Workers AI conforme recursos usados.
- [ ] Copiar o Account ID apenas quando necessário; o bootstrap suporta descoberta segura com token próprio.
- [ ] Confirmar que `workers.dev` está habilitado na conta.

O pipeline cria/confirma bancos e projetos Pages. Não é necessário compartilhar infraestrutura de outro sistema.

## 3. GitHub

- [ ] Confirmar Environments `staging` e `production`.
- [ ] Cadastrar `CLOUDFLARE_API_TOKEN` no Environment `staging`.
- [ ] Cadastrar `CLOUDFLARE_API_TOKEN` no Environment `production`.
- [ ] Opcional: cadastrar `ADMIN_PASSWORD` em cada ambiente para liberar o login administrativo. Sem ela, o deploy continua, mas o painel permanece bloqueado por uma senha aleatória descartável gerada em runtime.
- [ ] Opcional: cadastrar `CLOUDFLARE_ACCOUNT_ID` se a descoberta automática não conseguir desambiguar a conta.
- [ ] Em `production`, habilitar aprovação obrigatória se desejar uma trava humana antes da publicação.
- [ ] Proteger `main`: exigir pull request e CI verde.

Nunca colocar valores de Secrets no chat, commits, issues ou arquivos do repositório.

## 4. Publicação STAGING

- [ ] Executar o workflow `Deploy STAGING`.
- [ ] Confirmar que `Verificar credencial própria de staging` retorna `ready=true`.
- [ ] Confirmar que `Testar, migrar e publicar staging` executa e termina em `success`, não `skipped`.
- [ ] Confirmar migrations D1 `0001`–`0005`.
- [ ] Confirmar Worker `victor-simon-api-staging`.
- [ ] Confirmar Pages `victor-simon-site-staging`.
- [ ] Confirmar smoke test verde.
- [ ] Validar `https://victor-simon-site-staging.pages.dev`.
- [ ] Validar formulário, Blog, PT/EN e responsividade.
- [ ] Se `ADMIN_PASSWORD` estiver configurada, validar login e Growth Loop no painel.

## 5. Publicação PRODUÇÃO

- [ ] Confirmar que o código homologado está em `main`.
- [ ] Executar/acompanhar `Deploy PRODUCTION`.
- [ ] Confirmar que `Verificar credencial própria` retorna `ready=true`.
- [ ] Confirmar que `Testar, migrar e publicar produção` executa e termina em `success`, não `skipped`.
- [ ] Confirmar migrations D1 `0001`–`0005`.
- [ ] Confirmar Worker `victor-simon-api`.
- [ ] Confirmar Pages `victor-hugo-teixeira-simon`.
- [ ] Confirmar smoke test verde.
- [ ] Validar `https://victor-hugo-teixeira-simon.pages.dev` e confirmar que contém a mesma versão homologada.
- [ ] Se `ADMIN_PASSWORD` estiver configurada, validar login administrativo.

## 6. Domínio oficial futuro

- [ ] Quando o domínio voltar a estar disponível, associar `www.victorhugoteixeirasimon.com.br` ao Pages `victor-hugo-teixeira-simon`.
- [ ] Ajustar nameservers no Registro.br somente se a zona ainda não estiver na Cloudflare.
- [ ] Redirecionar o domínio raiz para `www`.
- [ ] Validar HTTPS e certificado.
- [ ] Manter `victor-hugo-teixeira-simon.pages.dev` como contingência técnica.

## 7. Pós-deploy

- [ ] Testar `GET /api/health` no Worker.
- [ ] Enviar um lead de teste e conferir no painel.
- [ ] Executar um ciclo manual do Growth Loop quando o login administrativo estiver liberado.
- [ ] Cadastrar GA4 e GTM quando os IDs estiverem disponíveis.
- [ ] Verificar o domínio no Search Console e enviar `/sitemap.xml`.
- [ ] Trocar a senha administrativa sempre que houver suspeita de exposição.
- [ ] Manter Meta/WhatsApp desabilitado até a verificação do negócio e a configuração dos Secrets específicos.

## Estado atual verificado

Os readiness checks de STAGING e PRODUÇÃO registraram `HAS_TOKEN: false`. Portanto, enquanto `CLOUDFLARE_API_TOKEN` não existir no Environment correspondente, o job real de publicação será intencionalmente `skipped`.

`ADMIN_PASSWORD` não bloqueia mais a infraestrutura: sua ausência mantém apenas o login administrativo bloqueado.

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
