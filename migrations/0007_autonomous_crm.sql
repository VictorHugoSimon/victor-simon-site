PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS crm_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  region TEXT,
  offer_key TEXT,
  icp_score INTEGER NOT NULL DEFAULT 0 CHECK (icp_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'target',
  source TEXT NOT NULL DEFAULT 'manual',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_contacts (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES crm_accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  role TEXT,
  seniority TEXT,
  language TEXT NOT NULL DEFAULT 'pt',
  status TEXT NOT NULL DEFAULT 'researching',
  source TEXT NOT NULL DEFAULT 'manual',
  consent_status TEXT NOT NULL DEFAULT 'unknown',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_signals (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES crm_accounts(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES crm_contacts(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_url TEXT,
  signal_score INTEGER NOT NULL DEFAULT 0 CHECK (signal_score BETWEEN 0 AND 100),
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_scores (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  icp_fit INTEGER NOT NULL DEFAULT 0,
  intent INTEGER NOT NULL DEFAULT 0,
  engagement INTEGER NOT NULL DEFAULT 0,
  authority INTEGER NOT NULL DEFAULT 0,
  timing INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  explanation_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_activities (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES crm_accounts(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES crm_contacts(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'internal',
  status TEXT NOT NULL DEFAULT 'completed',
  summary TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_tasks (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES crm_accounts(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES crm_contacts(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority INTEGER NOT NULL DEFAULT 50,
  approval_required INTEGER NOT NULL DEFAULT 1,
  approved_at TEXT,
  due_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_suppressions (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  value_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel, value_hash)
);

CREATE TABLE IF NOT EXISTS crm_agent_jobs (
  id TEXT PRIMARY KEY,
  agent_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_account ON crm_contacts(account_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_scores_hot ON crm_scores(total DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks(status, priority DESC, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_agent_jobs_due ON crm_agent_jobs(status, scheduled_at);
