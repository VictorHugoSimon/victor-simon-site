PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS research_notes (
  id TEXT PRIMARY KEY,
  idea_id TEXT,
  source_url TEXT,
  source_title TEXT,
  publisher TEXT,
  summary TEXT,
  facts_json TEXT,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'review',
  researched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (idea_id) REFERENCES content_ideas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_research_notes_idea
  ON research_notes(idea_id, researched_at DESC);

CREATE TABLE IF NOT EXISTS attribution_touches (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  lead_id TEXT,
  content_item_id TEXT,
  publication_id TEXT,
  campaign_id TEXT,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  term TEXT,
  content TEXT,
  landing_page TEXT,
  referrer TEXT,
  event_name TEXT NOT NULL DEFAULT 'touch',
  metadata_json TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE SET NULL,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attribution_session_date
  ON attribution_touches(session_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_attribution_lead_date
  ON attribution_touches(lead_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_attribution_content_date
  ON attribution_touches(content_item_id, occurred_at);

CREATE TABLE IF NOT EXISTS lead_attribution (
  lead_id TEXT PRIMARY KEY,
  first_touch_id TEXT,
  last_touch_id TEXT,
  first_source TEXT,
  last_source TEXT,
  first_content_item_id TEXT,
  last_content_item_id TEXT,
  first_campaign_id TEXT,
  last_campaign_id TEXT,
  attributed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (first_touch_id) REFERENCES attribution_touches(id) ON DELETE SET NULL,
  FOREIGN KEY (last_touch_id) REFERENCES attribution_touches(id) ON DELETE SET NULL,
  FOREIGN KEY (first_content_item_id) REFERENCES content_items(id) ON DELETE SET NULL,
  FOREIGN KEY (last_content_item_id) REFERENCES content_items(id) ON DELETE SET NULL,
  FOREIGN KEY (first_campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (last_campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS content_performance_daily (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL,
  publication_id TEXT,
  channel TEXT NOT NULL,
  metric_date TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  engagements INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  meetings INTEGER NOT NULL DEFAULT 0,
  proposals INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0,
  seo_clicks INTEGER NOT NULL DEFAULT 0,
  seo_impressions INTEGER NOT NULL DEFAULT 0,
  avg_position REAL,
  content_score REAL NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE SET NULL,
  UNIQUE(content_item_id, channel, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_content_performance_date
  ON content_performance_daily(metric_date DESC, channel);
CREATE INDEX IF NOT EXISTS idx_content_performance_score
  ON content_performance_daily(content_score DESC, metric_date DESC);

CREATE TABLE IF NOT EXISTS publication_jobs (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL,
  publication_id TEXT,
  channel TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'publish',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TEXT,
  last_error TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_publication_jobs_due
  ON publication_jobs(status, next_attempt_at, attempts);

CREATE TABLE IF NOT EXISTS growth_cycles (
  id TEXT PRIMARY KEY,
  cycle_type TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'running',
  summary_json TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_growth_cycles_type_date
  ON growth_cycles(cycle_type, created_at DESC);
