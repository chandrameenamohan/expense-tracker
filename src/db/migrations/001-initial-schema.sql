-- Initial schema: raw_emails, transactions, sync_state, categories, category_corrections

CREATE TABLE raw_emails (
  message_id TEXT PRIMARY KEY,
  from_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  date TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  email_message_id TEXT NOT NULL REFERENCES raw_emails(message_id),
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  type TEXT NOT NULL CHECK (type IN ('upi', 'credit_card', 'bank_transfer', 'sip', 'loan')),
  merchant TEXT NOT NULL,
  account TEXT,
  bank TEXT,
  reference TEXT,
  description TEXT,
  category TEXT,
  source TEXT NOT NULL CHECK (source IN ('regex', 'ai')),
  confidence REAL,
  needs_review INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(email_message_id, amount, merchant, date)
);

CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_category ON transactions(category);
CREATE INDEX idx_transactions_needs_review ON transactions(needs_review);
CREATE INDEX idx_transactions_email_message_id ON transactions(email_message_id);

CREATE TABLE sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories (
  name TEXT PRIMARY KEY,
  parent TEXT,
  description TEXT
);

CREATE TABLE category_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant TEXT NOT NULL,
  description TEXT,
  original_category TEXT NOT NULL,
  corrected_category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_corrections_merchant ON category_corrections(merchant);
