ALTER TABLE subscriptions ADD COLUMN platform_name TEXT NOT NULL DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN account_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE subscriptions ADD COLUMN card_last4 TEXT;

UPDATE subscriptions
SET platform_name = name
WHERE trim(platform_name) = '';

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_platform_order
  ON subscriptions (user_id, platform_name, account_number, created_at, id);
