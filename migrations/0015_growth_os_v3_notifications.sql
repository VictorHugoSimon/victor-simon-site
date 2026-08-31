PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS crm_owner_notifications (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  status TEXT NOT NULL DEFAULT 'queued',
  provider_attempts INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  error_message TEXT,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_owner_notifications_queue
  ON crm_owner_notifications(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_owner_notifications_entity
  ON crm_owner_notifications(entity_type, entity_id, created_at DESC);
