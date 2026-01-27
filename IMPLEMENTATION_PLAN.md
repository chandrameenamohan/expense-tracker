# Implementation Plan

Generated from specs. Tasks are ordered by dependency.

## Phase 1: Foundation

- [x] Project scaffolding (package.json, tsconfig, biome, gitignore)
- [x] Ralph loop infrastructure (loop.sh, PROMPT files, AGENTS.md)
- [x] Specs directory with core spec files
- [ ] SQLite database setup (schema, migrations, connection)
- [ ] Basic CLI entry point

## Phase 2: Gmail Integration

- [ ] Gmail OAuth2 setup (credentials, token storage)
- [ ] Email fetching (query transaction emails)
- [ ] Email content extraction (HTML/text parsing)

## Phase 3: Transaction Parsing

- [ ] UPI transaction parser
- [ ] Credit card transaction parser
- [ ] Bank account transaction parser
- [ ] SIP transaction parser
- [ ] Loan transaction parser
- [ ] Unified parser interface

## Phase 4: Storage & Data Layer

- [ ] Transaction CRUD operations
- [ ] Deduplication logic
- [ ] Sync state tracking

## Future Phases (specs pending)

- [ ] AI categorization
- [ ] CLI commands & interaction
- [ ] Chat mode
- [ ] Reports & insights
- [ ] Budget management
- [ ] Sync modes
