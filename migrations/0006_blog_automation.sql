PRAGMA foreign_keys = ON;

ALTER TABLE posts ADD COLUMN content_item_id TEXT;
ALTER TABLE posts ADD COLUMN seo_title TEXT;
ALTER TABLE posts ADD COLUMN seo_description TEXT;
ALTER TABLE posts ADD COLUMN canonical_url TEXT;
ALTER TABLE posts ADD COLUMN reading_minutes INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_content_item
  ON posts(content_item_id)
  WHERE content_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  processed INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_type_date
  ON automation_runs(run_type, started_at DESC);

