PRAGMA foreign_keys = ON;

-- Primeira carteira real para ativar a máquina comercial.
-- Somente empresas e URLs públicas; nenhum contato externo é enviado por esta migração.
INSERT OR IGNORE INTO crm_campaigns (
  id, name, offer_key, industry, region, default_icp_score, status, source, goals_json
) VALUES (
  'campaign_seed_agro_tech_2026_08',
  'Agro, Indústria & Transformação Digital — Carteira Inicial',
  'automacao-dados-ia',
  'Agronegócio, agroindústria e máquinas',
  'Brasil / foco São Paulo',
  82,
  'active',
  'public_signal_seed',
  '{"objective":"Gerar oportunidades para Produto, Projetos, PMO, Delivery, Dados, Automação e IA","policy":"public_sources_only","outbound":"human_approval_required"}'
);

INSERT OR IGNORE INTO crm_accounts (id,name,website,industry,region,offer_key,icp_score,status,source,metadata_json) VALUES
('account_seed_sol_rzk','Sol by RZK','https://solrzk.com.br','AgTech, conectividade e inteligência de dados','Indaiatuba/SP','automacao-dados-ia',90,'researching','public_signal_seed','{"seed":"2026-08","sourceUrl":"https://solrzk.com.br/","reason":"Expansão de posicionamento em infraestrutura digital, dados e IA no agro"}'),
('account_seed_tereos','Tereos Brasil','https://br.tereos.com','Agroindústria sucroenergética','Noroeste de São Paulo','automacao-dados-ia',92,'researching','public_signal_seed','{"seed":"2026-08","sourceUrl":"https://br.tereos.com/pt-pt/press-releases/tereos-mapeia-162-mil-hectares-e-estrutura-novo-modelo-de-manejo-de-solo-para-ampliar-produtividade-no-campo/","reason":"Projetos recentes de tecnologia, eficiência e dados no campo"}'),
('account_seed_saomartinho','São Martinho','https://www.saomartinho.com.br','Agroindústria sucroenergética','São Paulo','sprint-produto-delivery',88,'researching','public_signal_seed','{"seed":"2026-08","sourceUrl":"https://nossasnoticias.saomartinho.com.br/blog/conexao-com-o-futuro-concluimos-100-do-projeto-rise2025/","reason":"Modernização de ERP, cloud e integração entre TI e negócio"}'),
('account_seed_jacto','Jacto','https://www.jacto.com.br','Máquinas e tecnologia agrícola','Pompeia/SP','automacao-dados-ia',88,'researching','public_signal_seed','{"seed":"2026-08","sourceUrl":"https://blog.jacto.com.br/pulverizador-autonomo/","reason":"Automação, sensores, inteligência de dados e produtos autônomos"}'),
('account_seed_stara','Stara','https://www.stara.com.br','Máquinas agrícolas e agricultura de precisão','Brasil','sprint-produto-delivery',86,'researching','public_signal_seed','{"seed":"2026-08","sourceUrl":"https://www.stara.com.br/noticias/feiras-e-eventos/agrishow-2026-agricultura-de-precisao-conectividade-e-a-presenca-da-stara","reason":"Conectividade, dados, treinamento digital e experiência do produtor"}'),
('account_seed_baldan','Baldan','https://baldan.com.br','Máquinas e implementos agrícolas','Matão/SP','sprint-produto-delivery',84,'researching','public_signal_seed','{"seed":"2026-08","sourceUrl":"https://baldan.com.br/baldan-atrai-publico-e-vendas-na-agrishow-2026-com-lancamentos-e-condicoes-diversificadas-de-credito/","reason":"Lançamentos, tecnologia operacional e expansão comercial"}'),
('account_seed_marchesan','Marchesan','https://www.marchesan.com.br','Máquinas e implementos agrícolas','Matão/SP','automacao-dados-ia',82,'researching','public_signal_seed','{"seed":"2026-08","sourceUrl":"https://www.marchesan.com.br/tecnologia","reason":"Agricultura de precisão, monitoramento, medição e controle"}'),
('account_seed_coopercitrus','Coopercitrus','https://coopercitrus.com.br','Cooperativa agropecuária e serviços','São Paulo e Minas Gerais','sprint-produto-delivery',88,'researching','public_signal_seed','{"seed":"2026-08","sourceUrl":"https://coopercitrus.com.br/contato/","reason":"Operação digital com Campo Digital e ecossistema amplo de cooperados e fornecedores"}');

INSERT OR IGNORE INTO crm_campaign_targets (id,campaign_id,account_id,priority,research_status,notes) VALUES
('target_seed_sol_rzk','campaign_seed_agro_tech_2026_08','account_seed_sol_rzk',90,'queued','Priorizar transformação digital, dados, IA e governança de execução.'),
('target_seed_tereos','campaign_seed_agro_tech_2026_08','account_seed_tereos',92,'queued','Priorizar dados, automação, integração e eficiência operacional.'),
('target_seed_saomartinho','campaign_seed_agro_tech_2026_08','account_seed_saomartinho',88,'queued','Priorizar PMO, delivery, integração e evolução pós-modernização ERP.'),
('target_seed_jacto','campaign_seed_agro_tech_2026_08','account_seed_jacto',88,'queued','Priorizar produto digital, automação, dados e operação conectada.'),
('target_seed_stara','campaign_seed_agro_tech_2026_08','account_seed_stara',86,'queued','Priorizar produto, conectividade, treinamento e experiência digital.'),
('target_seed_baldan','campaign_seed_agro_tech_2026_08','account_seed_baldan',84,'queued','Priorizar produto, processos comerciais e eficiência digital.'),
('target_seed_marchesan','campaign_seed_agro_tech_2026_08','account_seed_marchesan',82,'queued','Priorizar agricultura de precisão, dados e automação.'),
('target_seed_coopercitrus','campaign_seed_agro_tech_2026_08','account_seed_coopercitrus',88,'queued','Priorizar produto, jornadas digitais, integrações e operação de parceiros.');

INSERT OR IGNORE INTO crm_tasks (id,account_id,task_type,title,status,priority,approval_required,due_at,metadata_json) VALUES
('task_seed_sol_rzk','account_seed_sol_rzk','account_research','Pesquisar empresa-alvo: Sol by RZK','open',90,0,datetime('now','+1 day'),'{"campaignId":"campaign_seed_agro_tech_2026_08","publicSourcesOnly":true,"noOutbound":true}'),
('task_seed_tereos','account_seed_tereos','account_research','Pesquisar empresa-alvo: Tereos Brasil','open',92,0,datetime('now','+1 day'),'{"campaignId":"campaign_seed_agro_tech_2026_08","publicSourcesOnly":true,"noOutbound":true}'),
('task_seed_saomartinho','account_seed_saomartinho','account_research','Pesquisar empresa-alvo: São Martinho','open',88,0,datetime('now','+1 day'),'{"campaignId":"campaign_seed_agro_tech_2026_08","publicSourcesOnly":true,"noOutbound":true}'),
('task_seed_jacto','account_seed_jacto','account_research','Pesquisar empresa-alvo: Jacto','open',88,0,datetime('now','+1 day'),'{"campaignId":"campaign_seed_agro_tech_2026_08","publicSourcesOnly":true,"noOutbound":true}'),
('task_seed_stara','account_seed_stara','account_research','Pesquisar empresa-alvo: Stara','open',86,0,datetime('now','+1 day'),'{"campaignId":"campaign_seed_agro_tech_2026_08","publicSourcesOnly":true,"noOutbound":true}'),
('task_seed_baldan','account_seed_baldan','account_research','Pesquisar empresa-alvo: Baldan','open',84,0,datetime('now','+1 day'),'{"campaignId":"campaign_seed_agro_tech_2026_08","publicSourcesOnly":true,"noOutbound":true}'),
('task_seed_marchesan','account_seed_marchesan','account_research','Pesquisar empresa-alvo: Marchesan','open',82,0,datetime('now','+1 day'),'{"campaignId":"campaign_seed_agro_tech_2026_08","publicSourcesOnly":true,"noOutbound":true}'),
('task_seed_coopercitrus','account_seed_coopercitrus','account_research','Pesquisar empresa-alvo: Coopercitrus','open',88,0,datetime('now','+1 day'),'{"campaignId":"campaign_seed_agro_tech_2026_08","publicSourcesOnly":true,"noOutbound":true}');

INSERT OR IGNORE INTO crm_agent_jobs (id,agent_key,status,input_json,scheduled_at) VALUES
('job_seed_sol_rzk','researcher','queued','{"accountId":"account_seed_sol_rzk","campaignId":"campaign_seed_agro_tech_2026_08","company":"Sol by RZK","website":"https://solrzk.com.br","sourceUrl":"https://solrzk.com.br/","policy":"public_sources_only"}',CURRENT_TIMESTAMP),
('job_seed_tereos','researcher','queued','{"accountId":"account_seed_tereos","campaignId":"campaign_seed_agro_tech_2026_08","company":"Tereos Brasil","website":"https://br.tereos.com","sourceUrl":"https://br.tereos.com/pt-pt/press-releases/tereos-mapeia-162-mil-hectares-e-estrutura-novo-modelo-de-manejo-de-solo-para-ampliar-produtividade-no-campo/","policy":"public_sources_only"}',CURRENT_TIMESTAMP),
('job_seed_saomartinho','researcher','queued','{"accountId":"account_seed_saomartinho","campaignId":"campaign_seed_agro_tech_2026_08","company":"São Martinho","website":"https://www.saomartinho.com.br","sourceUrl":"https://nossasnoticias.saomartinho.com.br/blog/conexao-com-o-futuro-concluimos-100-do-projeto-rise2025/","policy":"public_sources_only"}',CURRENT_TIMESTAMP),
('job_seed_jacto','researcher','queued','{"accountId":"account_seed_jacto","campaignId":"campaign_seed_agro_tech_2026_08","company":"Jacto","website":"https://www.jacto.com.br","sourceUrl":"https://blog.jacto.com.br/pulverizador-autonomo/","policy":"public_sources_only"}',CURRENT_TIMESTAMP),
('job_seed_stara','researcher','queued','{"accountId":"account_seed_stara","campaignId":"campaign_seed_agro_tech_2026_08","company":"Stara","website":"https://www.stara.com.br","sourceUrl":"https://www.stara.com.br/noticias/feiras-e-eventos/agrishow-2026-agricultura-de-precisao-conectividade-e-a-presenca-da-stara","policy":"public_sources_only"}',CURRENT_TIMESTAMP),
('job_seed_baldan','researcher','queued','{"accountId":"account_seed_baldan","campaignId":"campaign_seed_agro_tech_2026_08","company":"Baldan","website":"https://baldan.com.br","sourceUrl":"https://baldan.com.br/baldan-atrai-publico-e-vendas-na-agrishow-2026-com-lancamentos-e-condicoes-diversificadas-de-credito/","policy":"public_sources_only"}',CURRENT_TIMESTAMP),
('job_seed_marchesan','researcher','queued','{"accountId":"account_seed_marchesan","campaignId":"campaign_seed_agro_tech_2026_08","company":"Marchesan","website":"https://www.marchesan.com.br","sourceUrl":"https://www.marchesan.com.br/tecnologia","policy":"public_sources_only"}',CURRENT_TIMESTAMP),
('job_seed_coopercitrus','researcher','queued','{"accountId":"account_seed_coopercitrus","campaignId":"campaign_seed_agro_tech_2026_08","company":"Coopercitrus","website":"https://coopercitrus.com.br","sourceUrl":"https://coopercitrus.com.br/contato/","policy":"public_sources_only"}',CURRENT_TIMESTAMP);
