# Spec 02: Gmail Integration

## Overview

Connect to Gmail via OAuth2 to fetch transaction notification emails.

## OAuth2 Setup

1. A CLI setup wizard (`expense-tracker setup`) guides the user through creating a Google Cloud project and downloading credentials
2. User places `credentials.json` in `~/.expense-tracker/`
3. First run triggers browser-based OAuth consent flow
4. Token stored locally in `~/.expense-tracker/token.json`
5. Token auto-refreshes; re-auth only if revoked

### File Locations

All credentials and tokens live in `~/.expense-tracker/` alongside the database:

```
~/.expense-tracker/
├── credentials.json   # Google Cloud OAuth2 client credentials
├── token.json         # OAuth2 access/refresh token (auto-managed)
└── data.db            # SQLite database
```

### Required Scopes

- `https://www.googleapis.com/auth/gmail.readonly`

## Email Fetching

### Query Strategy

Hardcoded defaults for known Indian bank senders and transaction-related subject keywords:

- `subject:(transaction OR debit OR credit OR payment OR UPI OR EMI OR SIP)`
- `from:(alerts@hdfcbank.net OR alerts@icicibank.com OR alerts@axisbank.com OR alerts@sbicard.com OR ...)`
- Filter by date range to support incremental sync

### Sync Behavior

- **First sync**: Fetches emails from the last 12 months by default. Configurable via `--since=YYYY-MM-DD` flag.
- **Subsequent syncs**: Incremental — only fetches emails newer than the last sync timestamp (tracked in `sync_state` table).

### Fetch Process

1. List message IDs matching query
2. Batch-fetch message content (subject, from, date, body)
3. Extract plain text and HTML body
4. Store raw email in database for future reprocessing
5. Pass to transaction parser

### Rate Limiting

- Respect Gmail API quotas (250 units/second default)
- Implement exponential backoff on 429 errors

## Raw Email Storage

Raw email bodies are persisted in the database so that:
- Emails can be re-parsed when parsers improve or new bank formats are added
- No need to re-fetch from Gmail for reprocessing
- Supports debugging and parser development

See Spec 04 (Storage) for the `raw_emails` table schema.

## Data Model

```typescript
interface RawEmail {
  messageId: string;
  from: string;
  subject: string;
  date: Date;
  bodyText: string;
  bodyHtml?: string;
}
```

## Acceptance Criteria

- [ ] CLI setup wizard guides user through OAuth credential creation
- [ ] OAuth flow completes and stores token in `~/.expense-tracker/token.json`
- [ ] Fetches emails matching hardcoded transaction queries
- [ ] Handles pagination for large result sets
- [ ] First sync respects `--since` flag (default: 12 months)
- [ ] Incremental sync only fetches new emails since last sync
- [ ] Raw email bodies stored in database for reprocessing
- [ ] Graceful error handling for auth failures and rate limits
