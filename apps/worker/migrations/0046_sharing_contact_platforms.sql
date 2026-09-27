DROP INDEX IF EXISTS idx_sharing_seats_user_expiry;
DROP INDEX IF EXISTS idx_sharing_receivables_user_due;

CREATE TABLE sharing_seats_0046_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sharing_account_id TEXT NOT NULL,
  seat_number INTEGER NOT NULL CHECK (seat_number > 0),
  member_name TEXT,
  contact TEXT,
  contact_type TEXT CHECK (contact_type IS NULL OR contact_type IN ('wechat', 'telegram', 'ns', 'xianyu', 'email', 'phone', 'other')),
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

INSERT INTO sharing_seats_0046_new (
  id, user_id, sharing_account_id, seat_number, member_name, contact, contact_type,
  monthly_price, currency, billing_months, start_date, expires_at, status, notes, created_at, updated_at
)
SELECT
  id, user_id, sharing_account_id, seat_number, member_name, contact, contact_type,
  monthly_price, currency, billing_months, start_date, expires_at, status, notes, created_at, updated_at
FROM sharing_seats;

-- D1 始终开启外键。先复制子表并让它指向新车位表，再依次替换，整个迁移不需要关闭外键。
CREATE TABLE sharing_receivables_0046_new (
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
  FOREIGN KEY (seat_id) REFERENCES sharing_seats_0046_new(id) ON DELETE CASCADE
);

INSERT INTO sharing_receivables_0046_new (
  id, user_id, sharing_account_id, seat_id, period_start, period_end, due_date,
  amount, paid_amount, fee_amount, refund_amount, currency, status, paid_at, notes, created_at, updated_at
)
SELECT
  id, user_id, sharing_account_id, seat_id, period_start, period_end, due_date,
  amount, paid_amount, fee_amount, refund_amount, currency, status, paid_at, notes, created_at, updated_at
FROM sharing_receivables;

DROP TABLE sharing_receivables;
DROP TABLE sharing_seats;
ALTER TABLE sharing_seats_0046_new RENAME TO sharing_seats;
ALTER TABLE sharing_receivables_0046_new RENAME TO sharing_receivables;

CREATE INDEX IF NOT EXISTS idx_sharing_seats_user_expiry ON sharing_seats (user_id, expires_at, status, sharing_account_id);
CREATE INDEX IF NOT EXISTS idx_sharing_receivables_user_due ON sharing_receivables (user_id, due_date, status, id);
