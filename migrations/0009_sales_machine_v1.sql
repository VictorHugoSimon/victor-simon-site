PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS crm_opportunities (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES crm_accounts(id) ON DELETE SET NULL,
  contact_id TEXT NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  offer_key TEXT,
  stage TEXT NOT NULL DEFAULT 'discovery',
  estimated_value REAL NOT NULL DEFAULT 0,
  probability INTEGER NOT NULL DEFAULT 20 CHECK (probability BETWEEN 0 AND 100),
  next_action TEXT NOT NULL DEFAULT 'Revisar lead e definir abordagem humana',
  next_action_due_at TEXT,
  owner TEXT NOT NULL DEFAULT 'Victor Hugo',
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL DEFAULT 'hot_lead_handoff',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_message_drafts (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  contact_id TEXT NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'first_contact',
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  approval_required INTEGER NOT NULL DEFAULT 1,
  approved_at TEXT,
  rejected_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_stage ON crm_opportunities(status, stage, probability DESC, next_action_due_at);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_contact ON crm_opportunities(contact_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_message_drafts_status ON crm_message_drafts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_message_drafts_contact ON crm_message_drafts(contact_id, channel, created_at DESC);