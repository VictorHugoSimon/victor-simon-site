INSERT OR IGNORE INTO offers (id, name, description, target_ticket, active) VALUES
  ('offer_diagnostic', 'Diagnóstico executivo', 'Leitura de cenário, riscos e plano de ação.', 0, 1),
  ('offer_pmo', 'PMO e governança', 'Estruturação de portfólio, ritos, indicadores e governança.', 0, 1),
  ('offer_product', 'Produto e eficiência digital', 'Discovery, backlog, integrações e evolução de plataformas.', 0, 1),
  ('offer_intelligence', 'Inteligência de mercado', 'Dados, painéis executivos e apoio à decisão.', 0, 1);

INSERT OR IGNORE INTO revenue_projection (id, period, target) VALUES
  ('projection_2026_q3', '2026-Q3', 0),
  ('projection_2026_q4', '2026-Q4', 0),
  ('projection_2027_q1', '2027-Q1', 0),
  ('projection_2027_q2', '2027-Q2', 0),
  ('projection_2027_q3', '2027-Q3', 0),
  ('projection_2027_q4', '2027-Q4', 0);

INSERT OR IGNORE INTO seo_keywords (id, keyword, language, category, status) VALUES
  ('kw_pt_01', 'consultoria de gestão de projetos', 'pt', 'consultoria', 'active'),
  ('kw_pt_02', 'implantação de PMO', 'pt', 'pmo', 'active'),
  ('kw_pt_03', 'governança de portfólio', 'pt', 'pmo', 'active'),
  ('kw_pt_04', 'gestão de produtos digitais', 'pt', 'produto', 'active'),
  ('kw_pt_05', 'inteligência de mercado para empresas', 'pt', 'dados', 'active'),
  ('kw_en_01', 'project portfolio management consulting', 'en', 'consulting', 'active'),
  ('kw_en_02', 'PMO implementation services', 'en', 'pmo', 'active'),
  ('kw_en_03', 'digital product governance', 'en', 'product', 'active'),
  ('kw_en_04', 'business intelligence consulting Brazil', 'en', 'data', 'active'),
  ('kw_neg_01', 'curso grátis', 'pt', 'negative', 'negative'),
  ('kw_neg_02', 'free course', 'en', 'negative', 'negative');
