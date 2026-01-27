# Expense Tracker - Operational Guide

## Project Overview

AI-powered personal expense tracker that parses transaction emails from Gmail, auto-categorizes expenses, and provides budget insights via CLI.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **Database**: SQLite via better-sqlite3
- **Email**: Gmail API (OAuth2)
- **AI**: Claude via `claude` CLI subprocess (Claude Code Max plan — no Anthropic API key)
- **Linting/Formatting**: Biome

## Project Structure

```
src/
├── index.ts          # CLI entry point
├── db/               # Database layer (schema, migrations, queries)
├── gmail/            # Gmail OAuth & email fetching
├── parser/           # Transaction email parsers
├── categorizer/      # AI categorization
├── cli/              # CLI commands & output
└── types/            # Shared TypeScript types
```

## Conventions

- All source code in `src/`, tests in `tests/`
- One module per concern, explicit exports via index files
- Use `better-sqlite3` synchronous API (Bun-compatible)
- Specs live in `specs/` — they are the source of truth
- Never store credentials in code; use environment variables or local config files excluded via `.gitignore`

## Commands

| Command | Purpose |
|---------|---------|
| `bun run dev` | Run the application |
| `bun test` | Run tests |
| `bun run typecheck` | Type check without emitting |
| `bun run lint` | Lint with Biome |
| `bun run lint:fix` | Auto-fix lint issues |
| `bun run format` | Format with Biome |

## Privacy

- All data stored locally in SQLite
- No telemetry, no cloud sync
- Gmail access is read-only, used only to fetch transaction emails
