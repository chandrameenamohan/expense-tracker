# Spec 01: Project Overview

## Objective

Build a privacy-first, AI-powered personal expense tracker that automatically ingests transaction emails from Gmail, parses and categorizes expenses, and provides budget insights through a CLI interface.

## Key Goals

1. **Automated ingestion** — Fetch transaction notification emails from Gmail
2. **Smart parsing** — Extract transaction details (amount, merchant, date, type) from various bank/service email formats
3. **AI categorization** — Auto-categorize expenses using Claude
4. **Local storage** — All data persists in local SQLite database
5. **CLI interface** — Query expenses, view reports, manage budgets from the terminal
6. **Conversational queries** — Ask questions about spending in natural language

## Constraints

- **Privacy-first**: No cloud storage. All data stays on the local machine.
- **Offline capable**: Works without internet after initial email sync.
- **Read-only Gmail access**: Only reads emails, never modifies or sends.
- **Indian banking focus**: Supports UPI, Indian credit cards, Indian bank accounts, SIPs, and loans.

## Transaction Types

| Type | Source Examples |
|------|---------------|
| UPI | Google Pay, PhonePe, Paytm, BHIM |
| Credit Card | HDFC, ICICI, SBI, Axis, Amex |
| Bank Account | Debit alerts, NEFT/RTGS/IMPS notifications |
| SIP | Mutual fund SIP debit confirmations |
| Loan | EMI debit notifications |

## Success Criteria

- [ ] Successfully authenticates with Gmail API
- [ ] Parses at least 3 different bank email formats
- [ ] Stores transactions in SQLite with no duplicates
- [ ] Auto-categorizes expenses with >80% accuracy
- [ ] CLI shows expense summary, category breakdown, monthly trends
- [ ] Responds to natural language queries about spending
