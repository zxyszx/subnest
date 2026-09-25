CREATE TABLE IF NOT EXISTS newszxcn_integrations (
  user_id TEXT PRIMARY KEY,
  base_url TEXT NOT NULL DEFAULT 'https://mail.newszxcn.com',
  token_ciphertext TEXT NOT NULL,
  token_mask TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS shared_inbox_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  short_key_hash TEXT NOT NULL UNIQUE,
  short_key_ciphertext TEXT NOT NULL,
  external_grant_id TEXT NOT NULL UNIQUE,
  grant_id TEXT NOT NULL UNIQUE,
  mailbox_id TEXT NOT NULL,
  mailbox_address TEXT NOT NULL,
  folder_ids_json TEXT NOT NULL,
  window_minutes INTEGER NOT NULL,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_shared_inbox_links_user ON shared_inbox_links(user_id, status, created_at);
