# Spec 03: Transaction Parser

## Overview

Parse transaction details from raw email content using a two-tier strategy: fast regex parsers for known banks, with an AI fallback (via `claude` CLI) for unrecognized formats.

## Data Types

```typescript
interface Transaction {
  id: string;              // Generated unique ID
  emailMessageId: string;  // Gmail message ID (for dedup)
  date: Date;
  amount: number;          // Always positive, in INR (billed amount)
  currency: string;        // ISO 4217 code, default "INR"
  direction: "debit" | "credit";
  type: "upi" | "credit_card" | "bank_transfer" | "sip" | "loan";
  merchant: string;        // Payee/payer name
  account: string;         // Account identifier (masked card/account number)
  bank: string;            // Bank name
  reference?: string;      // UPI ref / transaction ID
  description?: string;    // Raw transaction description
  category?: string;       // Assigned later by categorizer
  source: "regex" | "ai";  // Which tier parsed this transaction
  confidence?: number;     // AI confidence score (0-1), null for regex
}

interface Parser {
  canParse(email: RawEmail): boolean;
  parse(email: RawEmail): Transaction[] | null;  // Array: one email may yield multiple transactions
}
```

Note: For international credit card transactions, only the final INR billed amount is stored. Foreign currency amounts are not captured.

## Parsing Pipeline

```
Email → Regex parsers (in order) → AI fallback → give up
```

1. Run each regex parser's `canParse()` against the email
2. First match runs `parse()` — if it returns results, done
3. If regex parser claims the email (`canParse=true`) but `parse()` returns null, **fall through to AI fallback** (don't give up)
4. If no regex parser matches, go to AI fallback
5. AI fallback sends email body to `claude` CLI for extraction
6. If AI returns results with confidence >= 0.7, accept them
7. If AI confidence < 0.7, flag transaction for manual review
8. If AI returns nothing, log as unparseable

## Regex Parsers

### UPI Parser
- Detects UPI transaction emails (Google Pay, PhonePe, bank UPI alerts)
- Extracts: amount, merchant/VPA, UPI reference number, date
- Handles both debit and credit

### Credit Card Parser
- Detects credit card transaction alerts
- Extracts: amount, merchant, card number (masked), date
- Handles domestic and international transactions (INR billed amount only)

### Bank Transfer Parser
- Detects NEFT/RTGS/IMPS/debit notifications
- Extracts: amount, account number, beneficiary, reference
- Handles salary credits, transfers

### SIP Parser
- Detects SIP/mutual fund debit confirmations
- Extracts: amount, fund name, folio number, date

### Loan Parser
- Detects EMI debit notifications
- Extracts: amount, loan account, EMI number, date

## AI Fallback Parser

When no regex parser handles an email, the body is sent to `claude` CLI:

```bash
claude -p "Extract transaction details from this email..." --output-format json
```

- Prompt includes the email body and expected JSON schema
- Response is validated against the Transaction type
- Each extracted transaction includes a `confidence` score (0-1)
- Transactions with confidence < 0.7 are flagged for manual review
- Source is marked as `"ai"` to distinguish from regex-parsed results

This allows new/unknown banks to work automatically without code changes.

## Multi-Transaction Emails

A single email may contain multiple transactions (e.g., bank statement summaries, bundled alerts). The `parse()` method returns `Transaction[]` to support this. Each transaction gets its own unique `id` but shares the same `emailMessageId`.

## Amount Normalization

All parsers normalize amounts consistently:
- Strip currency symbols: `Rs.`, `INR`, `₹`
- Remove commas: `1,50,000.00` → `150000.00`
- Always store as positive number (direction field indicates debit/credit)

## Acceptance Criteria

- [ ] Each regex parser correctly identifies its email type
- [ ] Parses amount, date, merchant from all five banks (HDFC, ICICI, SBI, Axis, Amex)
- [ ] Handles both HTML and plain text email bodies
- [ ] Multi-transaction emails produce multiple Transaction objects
- [ ] Amount normalization handles "Rs.", "INR", "₹", commas, Indian number format
- [ ] Regex parse failure falls through to AI fallback (not silently dropped)
- [ ] AI fallback extracts transactions via `claude` CLI subprocess
- [ ] AI-parsed transactions include confidence score; low confidence flagged for review
- [ ] Transactions tagged with `source: "regex" | "ai"`
- [ ] Returns empty array for truly unparseable emails (no crashes)
