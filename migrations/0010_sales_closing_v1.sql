PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS crm_opportunity_history (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  note TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_proposals (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  scope_json TEXT NOT NULL DEFAULT '[]',
  value REAL NOT NULL DEFAULT 0,
  payment_terms TEXT,
  validity_days INTEGER NOT NULL DEFAULT 15,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  approval_required INTEGER NOT NULL DEFAULT 1,
  approved_at TEXT,
  shared_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_followups (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  objective TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  approval_required INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(opportunity_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_crm_opportunity_history ON crm_opportunity_history(opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_proposals_opportunity ON crm_proposals(opportunity_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_crm_proposals_status ON crm_proposals(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_followups_due ON crm_followups(status, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_followups_opportunity ON crm_followups(opportunity_id, sequence_no);