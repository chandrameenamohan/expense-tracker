# Spec 04: Storage

## Overview

Local SQLite database for persisting transactions, raw emails, sync state, categories, and category correction history.

## Database Location

- Default: `~/.expense-tracker/data.db`
- Configurable via `EXPENSE_TRACKER_DB` environment variable

## Schema

### raw_emails

Stores raw email content for reprocessing (see Spec 02).

```sql
CREATE TABLE raw_emails (
  message_id TEXT PRIMARY KEY,
  from_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  date TEXT NOT NULL,              -- ISO 8601
  body_text TEXT NOT NULL,
  body_html TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### transactions

```sql
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  email_message_id TEXT NOT NULL REFERENCES raw_emails(message_id),
  date TEXT NOT NULL,                    -- ISO 8601
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',  -- ISO 4217
  direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  type TEXT NOT NULL CHECK (type IN ('upi', 'credit_card', 'bank_transfer', 'sip', 'loan')),
  merchant TEXT NOT NULL,
  account TEXT,
  bank TEXT,
  reference TEXT,
  description TEXT,
  category TEXT,
  source TEXT NOT NULL CHECK (source IN ('regex', 'ai')),
  confidence REAL,                       -- AI confidence 0-1, NULL for regex
  needs_review INTEGER NOT NULL DEFAULT 0, -- 1 if AI confidence < 0.7
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(email_message_id, amount, merchant, date)  -- composite dedup key
);

CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_category ON transactions(category);
CREATE INDEX idx_transactions_needs_review ON transactions(needs_review);
CREATE INDEX idx_transactions_email_message_id ON transactions(email_message_id);
```

### sync_state

```sql
CREATE TABLE sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Tracks: `last_sync_timestamp`, `last_message_id`, `total_synced_count`.

### categories

Flat list (no hierarchy for now). The `parent` column is reserved for future use.

```sql
CREATE TABLE categories (
  name TEXT PRIMARY KEY,
  parent TEXT,
  description TEXT
);
```

Pre-seeded defaults: Food, Transport, Shopping, Bills, Entertainment, Health, Education, Investment, Transfer, Other.

### category_corrections

Stores user overrides to feed back into AI categorization as few-shot examples.

```sql
CREATE TABLE category_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant TEXT NOT NULL,
  description TEXT,              -- transaction description pattern
  original_category TEXT NOT NULL,
  corrected_category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_corrections_merchant ON category_corrections(merchant);
```

When categorizing new transactions, recent corrections for matching merchants are included in the `claude` prompt as examples.

### migrations

```sql
CREATE TABLE migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Migrations

- Migrations stored as numbered SQL files in `src/db/migrations/`
- Applied sequentially on startup
- Track applied migrations in the `migrations` table

## Data Access

- Synchronous API using better-sqlite3
- Prepared statements for all queries
- Transaction support for batch inserts (email sync)

## Acceptance Criteria

- [ ] Database created at default or configured path
- [ ] Schema applied via migrations on first run
- [ ] Raw emails stored and queryable for reprocessing
- [ ] Transactions inserted with composite dedup (email_message_id + amount + merchant + date)
- [ ] Multi-transaction emails stored correctly (multiple rows, same email_message_id)
- [ ] `currency`, `source`, `confidence`, `needs_review` columns populated correctly
- [ ] CRUD operations for transactions
- [ ] Sync state tracked and queryable
- [ ] Default categories seeded
- [ ] Category corrections stored and queryable by merchant
- [ ] Needs-review transactions queryable via index
