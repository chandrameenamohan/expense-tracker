# expense-tracker

AI-powered personal expense tracker that automatically extracts financial transactions from Gmail bank/credit card alerts, categorizes them, and provides spending insights via CLI.

## Features

- **Email sync** — Fetches transaction alerts from Gmail via OAuth
- **Smart parsing** — Regex parsers for UPI, credit cards, bank transfers, SIP, loans + Claude AI fallback
- **AI categorization** — Categorizes transactions with confidence scores and learns from corrections
- **Duplicate detection** — SQL candidate selection + AI confirmation
- **Spending insights** — Summaries, category breakdowns, and conversational queries
- **Eval framework** — Parser, categorizer, and end-to-end evaluation suite

## Tech stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Database**: SQLite (better-sqlite3)
- **AI**: Claude CLI
- **Gmail**: googleapis OAuth

## Setup

```bash
bun install
bun run src/index.ts setup    # Configure Gmail OAuth credentials
```

## Usage

```bash
# Sync emails and parse transactions
bun run src/index.ts sync

# List transactions
bun run src/index.ts list

# Spending summary
bun run src/index.ts summary

# Review low-confidence transactions
bun run src/index.ts review

# Re-categorize a transaction
bun run src/index.ts recategorize

# Re-parse all emails from scratch
bun run src/index.ts reparse

# Conversational expense queries
bun run src/index.ts chat

# Show all commands
bun run src/index.ts help
```

## Project structure

```
src/
  cli/           CLI commands (sync, list, summary, review, etc.)
  parser/        Email parsing (regex + AI fallback)
  categorizer/   AI-powered transaction categorization
  dedup/         Duplicate detection and removal
  db/            SQLite database layer and migrations
  gmail/         Gmail API integration and OAuth
evals/           Evaluation framework with graders and runners
```

## Development

```bash
bun test              # Run tests
bun run typecheck     # Type check
bun run lint          # Lint with Biome
bun run eval          # Run evaluation suite
```
