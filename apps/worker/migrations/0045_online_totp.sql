CREATE TABLE IF NOT EXISTS online_totp_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform_name TEXT NOT NULL,
  service_name TEXT NOT NULL DEFAULT '',
  account_number INTEGER NOT NULL DEFAULT 1 CHECK (account_number BETWEEN 1 AND 10000),
  account TEXT NOT NULL,
  logo TEXT,
  secret_ciphertext TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sharing_enabled INTEGER NOT NULL DEFAULT 1 CHECK (sharing_enabled IN (0, 1)),
  share_key_hash TEXT NOT NULL UNIQUE,
  share_key_ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_online_totp_user_platform_number
  ON online_totp_accounts (user_id, platform_name COLLATE NOCASE, account_number);
CREATE INDEX IF NOT EXISTS idx_online_totp_user_order
  ON online_totp_accounts (user_id, lower(platform_name), account_number, created_at);
