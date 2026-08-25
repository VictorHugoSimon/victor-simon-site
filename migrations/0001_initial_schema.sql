PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  role TEXT,
  challenge TEXT NOT NULL,
  budget TEXT,
  deadline TEXT,
  authority TEXT,
  source TEXT NOT NULL DEFAULT 'website',
  language TEXT NOT NULL DEFAULT 'pt',
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  stage TEXT NOT NULL DEFAULT 'new',
  estimated_value REAL NOT NULL DEFAULT 0,
  dossier_json TEXT,
  nurture_touches INTEGER NOT NULL DEFAULT 0,
  last_nurture_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email_created
  ON leads(email, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_stage_score
  ON leads(stage, score DESC);

CREATE TABLE IF NOT EXISTS lead_stage_history (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_history_lead
  ON lead_stage_history(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  session_id TEXT,
  page TEXT,
  language TEXT NOT NULL DEFAULT 'pt',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_name_created
  ON analytics_events(event_name, created_at DESC);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'pt',
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  category TEXT,
  keywords_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posts_status_language
  ON posts(status, language, published_at DESC);

CREATE TABLE IF NOT EXISTS seo_keywords (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt',
  category TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(keyword, language)
);

CREATE TABLE IF NOT EXISTS seo_rankings (
  id TEXT PRIMARY KEY,
  keyword_id TEXT NOT NULL,
  position INTEGER,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  measured_at TEXT NOT NULL,
  FOREIGN KEY (keyword_id) REFERENCES seo_keywords(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rankings_keyword_date
  ON seo_rankings(keyword_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  target_ticket REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS revenue_projection (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL UNIQUE,
  target REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS revenue_actuals (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_revenue_actual_period
  ON revenue_actuals(period);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  channel TEXT NOT NULL,
  external_id TEXT,
  language TEXT NOT NULL DEFAULT 'pt',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_channel_external
  ON conversations(channel, external_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS nurture_log (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  touch_key TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  UNIQUE(lead_id, touch_key)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL
);
