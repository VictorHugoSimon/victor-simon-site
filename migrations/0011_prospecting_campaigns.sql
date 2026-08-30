PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS crm_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  offer_key TEXT,
  industry TEXT,
  region TEXT,
  default_icp_score INTEGER NOT NULL DEFAULT 60 CHECK (default_icp_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'manual_intake',
  goals_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_campaign_targets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 60 CHECK (priority BETWEEN 0 AND 100),
  research_status TEXT NOT NULL DEFAULT 'queued',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_campaigns_status ON crm_campaigns(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_targets_queue ON crm_campaign_targets(campaign_id, research_status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_targets_account ON crm_campaign_targets(account_id, campaign_id);