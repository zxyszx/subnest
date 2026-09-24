ALTER TABLE subscriptions ADD COLUMN family_sharing_enabled INTEGER NOT NULL DEFAULT 0 CHECK (family_sharing_enabled IN (0, 1));
ALTER TABLE subscriptions ADD COLUMN sharing_login_account TEXT NOT NULL DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN sharing_encrypted_credentials TEXT NOT NULL DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN sharing_password_mask TEXT NOT NULL DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN sharing_verification_link TEXT;
ALTER TABLE subscriptions ADD COLUMN sharing_capacity INTEGER NOT NULL DEFAULT 5 CHECK (sharing_capacity BETWEEN 1 AND 100);

CREATE TABLE IF NOT EXISTS sharing_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'archived')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sharing_seats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sharing_account_id TEXT NOT NULL,
  seat_number INTEGER NOT NULL CHECK (seat_number > 0),
  member_name TEXT,
  contact TEXT,
  contact_type TEXT CHECK (contact_type IS NULL OR contact_type IN ('wechat', 'telegram', 'email', 'phone', 'other')),
  monthly_price TEXT,
  currency TEXT,
  billing_months INTEGER,
  start_date TEXT,
  expires_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('vacant', 'active', 'paused', 'archived')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, sharing_account_id, seat_number),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sharing_account_id) REFERENCES sharing_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sharing_receivables (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sharing_account_id TEXT NOT NULL,
  seat_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount TEXT NOT NULL,
  paid_amount TEXT NOT NULL,
  fee_amount TEXT NOT NULL DEFAULT '0',
  refund_amount TEXT NOT NULL DEFAULT '0',
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'waived')),
  paid_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sharing_account_id) REFERENCES sharing_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (seat_id) REFERENCES sharing_seats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sharing_expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sharing_account_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'paid', 'cancelled')),
  paid_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sharing_account_id) REFERENCES sharing_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sharing_accounts_user_status ON sharing_accounts (user_id, status, subscription_id);
CREATE INDEX IF NOT EXISTS idx_sharing_seats_user_expiry ON sharing_seats (user_id, expires_at, status, sharing_account_id);
CREATE INDEX IF NOT EXISTS idx_sharing_receivables_user_due ON sharing_receivables (user_id, due_date, status, id);
CREATE INDEX IF NOT EXISTS idx_sharing_expenses_user_due ON sharing_expenses (user_id, due_date, status, id);
