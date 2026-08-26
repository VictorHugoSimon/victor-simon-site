PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  state_hash TEXT NOT NULL UNIQUE,
  redirect_uri TEXT NOT NULL,
  return_url TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_provider_expiry
  ON oauth_states(provider, expires_at, consumed_at);

CREATE TABLE IF NOT EXISTS social_credentials (
  id TEXT PRIMARY KEY,
  social_account_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  token_type TEXT,
  scopes_json TEXT,
  expires_at TEXT,
  refresh_expires_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_social_credentials_provider_expiry
  ON social_credentials(provider, expires_at);
