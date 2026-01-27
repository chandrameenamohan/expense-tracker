# Spec 04: Storage

## Overview

Local SQLite database for persisting transactions, sync state, and app configuration.

## Database Location

- Default: `~/.expense-tracker/data.db`
- Configurable via `EXPENSE_TRACKER_DB` environment variable

## Schema

### transactions

```sql
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  email_message_id TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,                    -- ISO 8601
  amount REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  type TEXT NOT NULL CHECK (type IN ('upi', 'credit_card', 'bank_transfer', 'sip', 'loan')),
  merchant TEXT NOT NULL,
  account TEXT,
  bank TEXT,
  reference TEXT,
  description TEXT,
  category TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_category ON transactions(category);
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

```sql
CREATE TABLE categories (
  name TEXT PRIMARY KEY,
  parent TEXT REFERENCES categories(name),
  description TEXT
);
```

Pre-seeded with default categories: Food, Transport, Shopping, Bills, Entertainment, Health, Education, Investment, Transfer, Other.

## Migrations

- Migrations stored as numbered SQL files in `src/db/migrations/`
- Applied sequentially on startup
- Track applied migrations in a `migrations` table

```sql
CREATE TABLE migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Data Access

- Synchronous API using better-sqlite3
- Prepared statements for all queries
- Transaction support for batch inserts (email sync)

## Acceptance Criteria

- [ ] Database created at default or configured path
- [ ] Schema applied via migrations on first run
- [ ] Transactions inserted with deduplication (email_message_id unique constraint)
- [ ] CRUD operations for transactions
- [ ] Sync state tracked and queryable
- [ ] Default categories seeded
