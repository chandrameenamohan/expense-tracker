CREATE TABLE IF NOT EXISTS duplicate_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kept_transaction_id TEXT NOT NULL REFERENCES transactions(id),
  duplicate_transaction_id TEXT NOT NULL REFERENCES transactions(id),
  reason TEXT NOT NULL,
  confidence REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(duplicate_transaction_id)
);
