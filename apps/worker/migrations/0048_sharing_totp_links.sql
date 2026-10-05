CREATE TABLE sharing_totp_links (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES sharing_accounts(id) ON DELETE CASCADE,
 seat_id TEXT NOT NULL DEFAULT '', totp_id TEXT NOT NULL REFERENCES online_totp_accounts(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, token_ciphertext TEXT NOT NULL, binding_hash TEXT NOT NULL,
 expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
 UNIQUE(user_id, account_id, seat_id)
);
