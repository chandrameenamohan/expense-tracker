# Spec 01: Project Overview

## Objective

Build a privacy-first, AI-powered personal expense tracker that automatically ingests transaction emails from Gmail, parses and categorizes expenses, and provides budget insights through a CLI interface.

## Key Goals

1. **Automated ingestion** — Fetch transaction notification emails from Gmail
2. **Smart parsing** — Extract transaction details (amount, merchant, date, type) from various bank/service email formats
3. **AI fallback parsing** — Unknown bank formats are parsed by Claude automatically, no code changes needed
4. **AI categorization** — Auto-categorize expenses using Claude, with a feedback loop that learns from user corrections
5. **Local storage** — All data persists in local SQLite database
6. **CLI interface** — Query expenses, view reports, manage budgets from the terminal (designed for future TUI extensibility)
7. **Conversational queries** — Ask questions about spending in natural language
8. **Proactive insights** — Surface spending anomalies and trends after sync and in chat mode

## Constraints

- **Privacy-first**: No cloud storage. All data stays on the local machine.
- **Offline capable**: Works without internet after initial email sync (AI features require connectivity).
- **Read-only Gmail access**: Only reads emails, never modifies or sends.
- **India-first, extensible**: Initial focus on Indian banks and INR, but the data model includes a `currency` field (default `'INR'`) to support other currencies later.
- **No Anthropic API key**: All AI features use the Claude Code CLI (`claude`) as a subprocess, authenticated via the user's existing Claude Code Max subscription. No separate Anthropic API key or billing required.

## Transaction Types

| Type | Source Examples |
|------|---------------|
| UPI | Google Pay, PhonePe, Paytm, BHIM |
| Credit Card | HDFC, ICICI, SBI, Axis, Amex |
| Bank Account | Debit alerts, NEFT/RTGS/IMPS notifications |
| SIP | Mutual fund SIP debit confirmations |
| Loan | EMI debit notifications |

All five banks (HDFC, ICICI, SBI, Axis, Amex) are supported from the initial release with dedicated regex parsers.

## Parsing Strategy

Two-tier approach:

1. **Regex parsers (fast path)** — Deterministic, zero API cost. Each known bank has a dedicated parser module implementing the `Parser` interface.
2. **AI fallback (slow path)** — When no regex parser matches, the email body is sent to Claude for best-effort extraction. This handles unknown/new banks automatically without code changes.

If an AI-parsed bank appears frequently, a dedicated regex parser can be added for speed and cost savings.

## Categorization & Feedback Loop

- AI assigns categories on first parse.
- Users can override any category via CLI.
- Corrections are stored and used as few-shot examples to improve future categorization accuracy.

## Insights

- **Post-sync alerts**: Quick notable changes surfaced after each email sync (e.g., "You spent 40% more on dining this week").
- **Chat mode insights**: Deeper analysis available when the user enters conversational query mode.

## AI Execution Model

All AI-powered features are executed by spawning the `claude` CLI as a subprocess:

```
claude -p "your prompt here" --output-format json
```

- **No Anthropic API key needed** — authenticates via the user's Claude Code Max plan.
- **Subprocess pattern** — the app shells out to `claude` with a structured prompt and parses the stdout response.
- **Applies to**: AI fallback parsing, categorization, conversational queries, and proactive insights.
- **Offline behavior**: AI features gracefully degrade (skip/warn) when `claude` is unavailable or offline. Regex parsing and local data queries still work.

## Architecture Notes

- Presentation logic is decoupled from data/business logic to allow a future TUI or other frontends.
- Parser modules are self-contained and independently testable.
- AI module wraps all `claude` subprocess calls behind a single interface for testability and mocking.

## Success Criteria

- [ ] Successfully authenticates with Gmail API
- [ ] Parses all five priority banks via regex parsers
- [ ] AI fallback successfully extracts transactions from unrecognized bank formats
- [ ] Stores transactions in SQLite with no duplicates
- [ ] Auto-categorizes expenses with >80% accuracy (measured via labeled test set and manual spot-checks)
- [ ] User can override categories; corrections improve future predictions
- [ ] CLI shows expense summary, category breakdown, monthly trends
- [ ] Proactive insights surface after sync and in chat mode
- [ ] Responds to natural language queries about spending
