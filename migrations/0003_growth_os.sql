PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS content_ideas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  pillar TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  brief TEXT,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'backlog',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_content_ideas_status_score
  ON content_ideas(status, score DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  idea_id TEXT,
  parent_id TEXT,
  content_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt',
  title TEXT NOT NULL,
  body TEXT,
  hook TEXT,
  cta TEXT,
  pillar TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  approved_at TEXT,
  published_at TEXT,
  content_score REAL NOT NULL DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  slug TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (idea_id) REFERENCES content_ideas(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_id) REFERENCES content_items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_content_items_calendar
  ON content_items(status, scheduled_at, channel);
CREATE INDEX IF NOT EXISTS idx_content_items_pillar
  ON content_items(pillar, published_at DESC);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  content_item_id TEXT,
  asset_type TEXT NOT NULL,
  title TEXT,
  storage_key TEXT,
  public_url TEXT,
  alt_text TEXT,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'ready',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_media_assets_content
  ON media_assets(content_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  objective TEXT,
  pillar TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  starts_at TEXT,
  ends_at TEXT,
  target_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL,
  campaign_id TEXT,
  channel TEXT NOT NULL,
  external_id TEXT,
  external_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at TEXT,
  published_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_publications_channel_date
  ON publications(channel, published_at DESC);

CREATE TABLE IF NOT EXISTS publication_metrics (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  reactions INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  followers_delta INTEGER NOT NULL DEFAULT 0,
  engagement_rate REAL NOT NULL DEFAULT 0,
  measured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_publication_metrics_date
  ON publication_metrics(publication_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_approvals_pending
  ON approvals(decision, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent_key TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  input_ref TEXT,
  output_ref TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  duration_ms INTEGER,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_status_created
  ON agent_runs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  account_name TEXT NOT NULL,
  external_account_id TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  capabilities_json TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel, account_name)
);

CREATE TABLE IF NOT EXISTS growth_recommendations (
  id TEXT PRIMARY KEY,
  recommendation_type TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  action_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_growth_recommendations_status
  ON growth_recommendations(status, priority, created_at DESC);
