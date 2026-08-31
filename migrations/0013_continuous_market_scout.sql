PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS crm_scout_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  default_offer_key TEXT NOT NULL DEFAULT 'automacao-dados-ia',
  default_icp_score INTEGER NOT NULL DEFAULT 78 CHECK (default_icp_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  last_scanned_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_scout_candidates (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES crm_scout_sources(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  website TEXT NOT NULL,
  host_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'discovered',
  account_id TEXT REFERENCES crm_accounts(id) ON DELETE SET NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, host_key)
);

CREATE TABLE IF NOT EXISTS crm_account_enrichment (
  account_id TEXT PRIMARY KEY REFERENCES crm_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  last_attempt_at TEXT,
  last_success_at TEXT,
  sources_json TEXT NOT NULL DEFAULT '[]',
  output_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_scout_sources_status ON crm_scout_sources(status, last_scanned_at);
CREATE INDEX IF NOT EXISTS idx_crm_scout_candidates_status ON crm_scout_candidates(status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_enrichment_due ON crm_account_enrichment(status, last_attempt_at);

INSERT OR IGNORE INTO crm_campaigns (
  id, name, offer_key, industry, region, default_icp_score, status, source, goals_json
) VALUES (
  'campaign_market_scout_continuous',
  'Market Scout Contínuo — Agro & Indústria',
  'automacao-dados-ia',
  'Agronegócio, agroindústria, bioenergia, alimentos e máquinas',
  'Brasil',
  80,
  'active',
  'market_scout',
  '{"objective":"Descobrir continuamente empresas com sinais públicos de transformação, tecnologia e operações complexas","policy":"public_sources_only","outbound":"human_approval_required"}'
);

INSERT OR IGNORE INTO crm_scout_sources (
  id, name, url, default_offer_key, default_icp_score, status, metadata_json
) VALUES (
  'scout_hub_uniagro',
  'Hub UniAgro — empresas membro',
  'https://hubuniagro.com.br/',
  'automacao-dados-ia',
  84,
  'active',
  '{"reason":"Hub público de empresas do agronegócio usuárias de SAP e tecnologias emergentes","campaignId":"campaign_market_scout_continuous","allowed":"public_external_company_links_only"}'
);
