PRAGMA foreign_keys = ON;

ALTER TABLE leads ADD COLUMN service_interest TEXT;
ALTER TABLE leads ADD COLUMN preferred_contact TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE leads ADD COLUMN contact_consent INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS commercial_offers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  promise TEXT NOT NULL,
  audience TEXT,
  deliverables_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO commercial_offers (id, name, promise, audience, deliverables_json) VALUES
  ('diagnostico-executivo', 'Diagnóstico Executivo', 'Clareza sobre gargalos, prioridades e plano de ação.', 'Empresas com projetos travados ou pouca visibilidade executiva.', '["diagnóstico","mapa de prioridades","plano de 30 dias"]'),
  ('sprint-produto-delivery', 'Sprint de Produto & Delivery', 'Organizar produto, backlog, governança e ritmo de entrega.', 'Times de tecnologia e negócios em crescimento ou transformação.', '["discovery","roadmap","backlog priorizado","rituais e indicadores"]'),
  ('automacao-dados-ia', 'Automação, Dados & IA', 'Reduzir trabalho manual e transformar dados em decisão.', 'Operações que dependem de planilhas, tarefas repetitivas ou informação dispersa.', '["mapeamento","protótipo","automação ou dashboard","plano de escala"]');

CREATE TABLE IF NOT EXISTS lead_recommendations (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  offer_id TEXT REFERENCES commercial_offers(id) ON DELETE SET NULL,
  next_action TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'open',
  due_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'pt',
  source TEXT NOT NULL DEFAULT 'website',
  status TEXT NOT NULL DEFAULT 'active',
  subscribed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lead_recommendations_open ON lead_recommendations(status, priority DESC, due_at);
CREATE INDEX IF NOT EXISTS idx_leads_service ON leads(service_interest, stage, score DESC);
