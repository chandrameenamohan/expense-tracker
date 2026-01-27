# Spec 02: Gmail Integration

## Overview

Connect to Gmail via OAuth2 to fetch transaction notification emails.

## OAuth2 Setup

1. User provides Google Cloud OAuth2 credentials (`credentials.json`)
2. First run triggers browser-based OAuth consent flow
3. Token stored locally in `token.json` (gitignored)
4. Token auto-refreshes; re-auth only if revoked

### Required Scopes

- `https://www.googleapis.com/auth/gmail.readonly`

## Email Fetching

### Query Strategy

Search Gmail for transaction emails using queries like:
- `subject:(transaction OR debit OR credit OR payment OR UPI OR EMI OR SIP)`
- `from:(alerts@hdfcbank.net OR alerts@icicibank.com OR ...)`
- Filter by date range to support incremental sync

### Fetch Process

1. List message IDs matching query
2. Batch-fetch message content (subject, from, date, body)
3. Extract plain text or parse HTML body
4. Pass to transaction parser

### Rate Limiting

- Respect Gmail API quotas (250 units/second default)
- Implement exponential backoff on 429 errors

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

- [ ] OAuth flow completes and stores token locally
- [ ] Fetches emails matching transaction queries
- [ ] Handles pagination for large result sets
- [ ] Incremental sync (only fetch new emails since last sync)
- [ ] Graceful error handling for auth failures and rate limits
