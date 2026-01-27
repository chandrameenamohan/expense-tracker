# Implementation Plan

Generated from specs. Tasks are ordered by dependency.

## Phase 1: Foundation

- [x] Project scaffolding (package.json, tsconfig, biome, gitignore)
- [x] Ralph loop infrastructure (loop.sh, PROMPT files, AGENTS.md)
- [x] Specs directory with core spec files
- [x] Spec interviews complete (01-overview, 02-gmail, 03-parser, 04-storage)
- [x] 1.1 Shared TypeScript types (Transaction, RawEmail, Parser, etc.)
  > Done: `src/types/index.ts`. Key exports: `Transaction`, `RawEmail`, `Parser`, `Category`, `CategoryCorrection`, `SyncState`, `TransactionDirection`, `TransactionSource`, `TransactionType`. Notes: pure types, no runtime deps.
- [x] 1.2 Database connection module (singleton, env var support, testable)
  > Done: `src/db/connection.ts`, `src/db/index.ts`. Key exports: `getDb`, `getDbPath`, `closeDb`, `_resetDb`, `_setDb`. Notes: switched from better-sqlite3 to `bun:sqlite` (native build fails without Python); API is synchronous and compatible. WAL mode and foreign keys enabled by default.
- [x] 1.3 Migration runner (read numbered SQL files, apply in order, track in migrations table)
  > Done: `src/db/migrate.ts`, `src/db/migrations/` dir. Key exports: `runMigrations`. Notes: reads `NNN-name.sql` files from `src/db/migrations/`, applies in order, tracks in `migrations` table, rolls back on failure.
- [x] 1.4 Initial schema migration (all 6 tables + indexes from spec 04)
  > Done: `src/db/migrations/001-initial-schema.sql`. Tables: `raw_emails`, `transactions`, `sync_state`, `categories`, `category_corrections` (+ `migrations` from runner). All indexes and constraints per spec 04.
- [x] 1.5 Seed default categories (10 categories as migration 002)
  > Done: `src/db/migrations/002-seed-categories.sql`. Seeds: Food, Transport, Shopping, Bills, Entertainment, Health, Education, Investment, Transfer, Other.
- [x] 1.6 CLI entry point with command routing (parse argv, dispatch, run migrations on startup)
  > Done: `src/index.ts`, `src/cli/router.ts`, `src/cli/index.ts`. Key exports: `routeCommand`, `registerCommand`, `CommandHandler`. Notes: entry point runs migrations then routes argv. Commands registered via `registerCommand(name, handler)`. Help shown for no args/help/--help/-h.

## Phase 2: Gmail Integration

- [x] CLI setup wizard (`expense-tracker setup`) for OAuth credential guidance
  > Done: `src/gmail/config.ts`, `src/gmail/index.ts`, `src/cli/commands/setup.ts`, `src/index.ts` (modified). Key exports: `getConfigDir`, `getCredentialsPath`, `getTokenPath`, `hasCredentials`, `hasToken`, `setupCommand`. Notes: setup command registered in entry point; prints step-by-step Google Cloud OAuth setup instructions, detects existing credentials/token state.
- [x] Gmail OAuth2 flow (credentials.json → browser consent → token.json in ~/.expense-tracker/)
  > Done: `src/gmail/auth.ts`, `src/gmail/index.ts` (modified), `tests/gmail/auth.test.ts`. Key exports: `createOAuth2Client`, `getAuthUrl`, `exchangeCodeForToken`, `loadToken`, `authenticate`. Notes: uses `googleapis` OAuth2 client; local HTTP server on port 3847 receives callback; reads `credentials.json` (supports both `installed` and `web` keys); saves token to `token.json`; `authenticate()` is the main entry point that checks for existing token first.
- [x] Token auto-refresh and re-auth handling
  > Done: `src/gmail/auth.ts` (modified), `src/gmail/index.ts` (modified), `tests/gmail/token-refresh.test.ts` (created). Key exports: `saveToken`, `deleteToken`, `isTokenValid`, `StoredToken` (type). Notes: OAuth2 client `tokens` event listener auto-persists refreshed tokens, merging with existing to preserve refresh_token; `authenticate()` now validates token on load and triggers re-auth flow if revoked/expired.
- [x] Email query with hardcoded sender/subject filters
  > Done: `src/gmail/query.ts`, `src/gmail/index.ts` (modified), `tests/gmail/query.test.ts`. Key exports: `buildQuery`, `listMessageIds`. Notes: `buildQuery(afterDate?)` returns Gmail search query string with 10 Indian bank senders and 7 subject keywords; `listMessageIds(client, afterDate?)` paginates through Gmail API results returning all matching message IDs.
- [x] Email fetching with pagination and batch content retrieval
  > Done: `src/gmail/fetch.ts`, `src/gmail/index.ts` (modified), `tests/gmail/fetch.test.ts`. Key exports: `fetchMessages`, `getHeader`, `extractBodies`, `toRawEmail`. Notes: `fetchMessages(client, messageIds, batchSize?)` fetches full message content in batches (default 50), extracts headers + plain text + HTML bodies from multipart payloads, returns `RawEmail[]`.
- [x] Raw email storage in database
  > Done: `src/db/raw-emails.ts`, `src/db/index.ts` (modified), `tests/db/raw-emails.test.ts`. Key exports: `insertRawEmail`, `insertRawEmails`, `getRawEmail`, `getAllRawEmails`, `rawEmailExists`. Notes: uses INSERT OR IGNORE for dedup on message_id; `insertRawEmails` does batch insert in a transaction and returns count of newly inserted rows.
- [x] Incremental sync (track last sync in sync_state, `--since` flag for first sync, default 12 months)
  > Done: `src/db/sync-state.ts`, `src/gmail/sync.ts`, `src/db/index.ts` (modified), `src/gmail/index.ts` (modified), `tests/db/sync-state.test.ts`, `tests/gmail/sync.test.ts`. Key exports: `getSyncState`, `setSyncState`, `getLastSyncTimestamp`, `setLastSyncTimestamp`, `getTotalSyncedCount`, `incrementTotalSyncedCount`, `syncEmails`, `SyncOptions`, `SyncResult`. Notes: `syncEmails(client, options?)` orchestrates full sync — uses last sync timestamp for incremental, falls back to `options.since` or 12-month default; stores emails via `insertRawEmails` (dedup built-in); updates sync state after each run.
- [x] Rate limiting with exponential backoff on 429s
  > Done: `src/gmail/rate-limit.ts` (created), `src/gmail/fetch.ts` (modified), `src/gmail/query.ts` (modified), `src/gmail/index.ts` (modified), `tests/gmail/rate-limit.test.ts` (created). Key exports: `withRetry`, `isRateLimitError`, `computeDelay`, `RetryOptions`. Notes: `withRetry` wraps async calls with exponential backoff + jitter on 429 errors (max 5 retries, 1s initial delay, 32s cap); integrated into `fetchMessages` (per-message) and `listMessageIds` (per-page).

## Phase 3: Transaction Parsing

- [x] Parser interface (canParse/parse returning Transaction[])
  > Done: `src/parser/registry.ts`, `src/parser/index.ts`, `tests/parser/registry.test.ts`. Key exports: `ParserRegistry`. Notes: `ParserRegistry` holds ordered regex parsers + optional fallback; `parse(email)` tries each in order, falls through on null/empty, then tries fallback, returns `[]` if nothing works. `Parser` interface already defined in `src/types/index.ts`.
- [x] Amount normalization utility (Rs., INR, ₹, commas, Indian number format)
  > Done: `src/parser/amount.ts`, `src/parser/index.ts` (modified), `tests/parser/amount.test.ts`. Key exports: `normalizeAmount`, `extractAmount`. Notes: `normalizeAmount(raw)` strips Rs./INR/₹, removes commas, returns positive number or null; `extractAmount(text)` finds first currency amount in a string.
- [x] UPI parser (Google Pay, PhonePe, bank UPI alerts)
  > Done: `src/parser/upi.ts`, `src/parser/index.ts` (modified), `tests/parser/upi.test.ts`. Key exports: `upiParser`. Notes: detects UPI emails via subject/body patterns (UPI, Google Pay, PhonePe, VPA); extracts amount, direction, merchant (name or VPA), account, bank, UPI reference, date; handles HDFC, ICICI, SBI, Axis, Kotak, Google Pay, PhonePe banks; 17 tests passing.
- [x] Credit card parser (HDFC, ICICI, SBI, Axis, Amex)
  > Done: `src/parser/credit-card.ts`, `src/parser/index.ts` (modified), `tests/parser/credit-card.test.ts`. Key exports: `creditCardParser`. Notes: detects credit card emails via subject/body patterns; extracts amount, merchant, masked card number, direction, bank, date; handles HDFC, ICICI, SBI, Axis, Amex (+ Kotak, Citi, RBL, IndusInd, Yes Bank); 18 tests passing.
- [x] Bank transfer parser (NEFT/RTGS/IMPS, salary credits)
  > Done: `src/parser/bank-transfer.ts`, `src/parser/index.ts` (modified), `tests/parser/bank-transfer.test.ts`. Key exports: `bankTransferParser`. Notes: detects NEFT/RTGS/IMPS/fund transfer/salary credit emails via subject/body patterns; extracts amount, direction, merchant (or "Salary"), account, bank, reference number, date; handles HDFC, ICICI, SBI, Axis, Kotak, PNB, Bank of Baroda, Canara, Union Bank, IDFC, Yes Bank, IndusInd; 19 tests passing.
- [x] SIP parser (mutual fund debit confirmations)
  > Done: `src/parser/sip.ts`, `src/parser/index.ts` (modified), `tests/parser/sip.test.ts`. Key exports: `sipParser`. Notes: detects SIP/mutual fund emails via subject/body patterns (SIP, mutual fund, systematic investment, NAV, units allotted, folio, BSE/NSE order, scheme); extracts amount, fund name (from "scheme name" pattern), folio number (as reference), account, bank; handles HDFC, ICICI, SBI, Axis, Kotak, Paytm Money, Zerodha, Groww, Kuvera, CAMS, KFintech; always direction=debit; 23 tests passing.
- [x] Loan parser (EMI debit notifications)
  > Done: `src/parser/loan.ts`, `src/parser/index.ts` (modified), `tests/parser/loan.test.ts`. Key exports: `loanParser`. Notes: detects EMI/loan emails via subject/body patterns; extracts amount, loan type (home/car/personal/education/auto/generic), loan account number, EMI number, account, bank, date; handles HDFC, ICICI, SBI, Axis, Kotak, PNB, Bank of Baroda, Canara, Union Bank, IDFC, Yes Bank, IndusInd, Bajaj Finance, Tata Capital, Mahindra Finance; always direction=debit; 20 tests passing.
- [x] Parser pipeline orchestrator (run regex parsers → fallthrough logic)
  > Done: `src/parser/pipeline.ts`, `src/parser/index.ts` (modified), `tests/parser/pipeline.test.ts`. Key exports: `createParserPipeline`, `parseEmail`, `parseEmails`. Notes: `createParserPipeline()` returns a `ParserRegistry` with all 5 regex parsers registered in priority order (UPI, credit card, bank transfer, SIP, loan); AI fallback slot is available via `registry.setFallback()` for next task.
- [x] AI fallback parser via `claude` CLI subprocess (structured prompt, JSON output, confidence scoring)
  > Done: `src/parser/ai-fallback.ts`, `src/parser/pipeline.ts` (modified), `src/parser/index.ts` (modified), `tests/parser/ai-fallback.test.ts`, `tests/parser/pipeline.test.ts` (modified). Key exports: `aiFallbackParser`, `createAiFallbackParser`, `parseAiResponse`, `buildPrompt`, `toTransaction`, `SpawnFn`. Notes: uses `Bun.spawnSync` to call `claude -p <prompt> --output-format json`; parses JSON response with validation; `createAiFallbackParser(spawnFn?)` accepts DI for testing; `createParserPipeline(spawnFn?)` now wires AI fallback; confidence < 0.7 sets `needsReview: true`; 27 tests passing.
- [x] Low-confidence flagging (needs_review for confidence < 0.7)
  > Done: already implemented in `src/parser/ai-fallback.ts` (line 162: `needsReview: confidence < 0.7`). All regex parsers set `needsReview: false`. Tests in `tests/parser/ai-fallback.test.ts` cover both high and low confidence paths. No new code needed.

## Phase 4: Storage & Data Layer

- [x] Transaction CRUD operations
  > Done: `src/db/transactions.ts`, `src/db/index.ts` (modified), `tests/db/transactions.test.ts`. Key exports: `insertTransaction`, `insertTransactions`, `getTransaction`, `getTransactionsByEmail`, `listTransactions`, `updateTransactionCategory`, `updateTransactionReview`, `deleteTransaction`, `countTransactions`, `ListTransactionsOptions`. Notes: INSERT OR IGNORE for composite dedup; `listTransactions` supports filters (date range, type, category, direction, needsReview) with limit/offset; 20 tests passing.
- [x] Composite deduplication (email_message_id + amount + merchant + date)
  > Done: `tests/db/transactions.test.ts` (modified). Key exports: none (test-only). Notes: schema already has `UNIQUE(email_message_id, amount, merchant, date)` and `INSERT OR IGNORE` handles dedup; added 3 edge-case tests verifying each composite key component and full-match rejection.
- [x] Multi-transaction email support (multiple rows per email_message_id)
  > Done: `tests/db/transactions.test.ts` (modified). Key exports: none (test-only). Notes: schema already supports multiple rows per email_message_id via composite UNIQUE(email_message_id, amount, merchant, date); added 4 tests: multi-transaction storage/retrieval, intra-email dedup, mixed regex+ai sources, and count verification. No code changes needed — functionality was already in place.
- [x] Sync state tracking and querying
  > Done: `src/db/sync-state.ts` (modified), `src/db/index.ts` (modified), `src/gmail/sync.ts` (modified), `tests/db/sync-state.test.ts` (modified). Key exports: `getLastMessageId`, `setLastMessageId`, `getAllSyncState`. Notes: added last_message_id tracking per spec; added getAllSyncState query for full state dump; sync module now records last_message_id on each sync; 12 tests passing.
- [x] Review queue queries (needs_review transactions)
  > Done: `src/db/review-queue.ts`, `src/db/transactions.ts` (exported `rowToTransaction`), `src/db/index.ts` (modified), `tests/db/review-queue.test.ts`. Key exports: `getReviewQueue`, `getReviewQueueCount`, `resolveReview`, `flagForReview`, `ReviewQueueOptions`. Notes: `getReviewQueue` supports limit/offset/source filter; delegates to `listTransactions` and `countTransactions` internally; 8 tests passing.

## Phase 5: AI Categorization

- [x] Claude CLI wrapper module (single interface for all `claude` subprocess calls)
  > Done: `src/categorizer/claude-cli.ts`, `src/categorizer/index.ts`, `tests/categorizer/claude-cli.test.ts`. Key exports: `createClaudeCli`, `ClaudeCli`, `ClaudeResult`, `ClaudeOptions`, `SpawnFn`. Notes: `createClaudeCli(spawnFn?)` returns client with `run()`, `runJson<T>()`, and `isAvailable()` methods; handles JSON wrapper unwrapping and markdown fence stripping; DI-friendly via optional spawn function; 15 tests passing.
- [x] Category assignment prompt (transaction → category)
  > Done: `src/categorizer/categorize.ts`, `src/categorizer/index.ts` (modified), `tests/categorizer/categorize.test.ts`. Key exports: `categorizeTransaction`, `categorizeTransactions`, `buildCategoryPrompt`, `buildBatchCategoryPrompt`, `isValidCategory`, `CATEGORIES`, `CategoryName`. Notes: single and batch categorization via Claude CLI; validates against 10 known categories; falls back to "Other" on failure; clamps confidence to [0,1]; batch mode falls back to individual calls on parse failure; 17 tests passing.
- [x] Category override via CLI (user corrects a transaction's category)
  > Done: `src/cli/commands/recategorize.ts`, `src/index.ts` (modified), `tests/cli/recategorize.test.ts`. Key exports: `recategorizeCommand`. Notes: validates category against CATEGORIES list, checks transaction exists, updates via `updateTransactionCategory`, shows old→new category. Next task should wire in `category_corrections` storage to record the override.
- [x] Category corrections storage (merchant → corrected category in category_corrections table)
  > Done: `src/db/category-corrections.ts`, `src/db/index.ts` (modified), `src/cli/commands/recategorize.ts` (modified), `tests/db/category-corrections.test.ts`. Key exports: `insertCategoryCorrection`, `getCorrection`, `getCorrectionsByMerchant`, `getRecentCorrections`. Notes: recategorize command now records corrections automatically; queries by merchant or recent; 10 tests passing.
- [x] Feedback loop: include recent corrections as few-shot examples in categorization prompt
  > Done: `src/categorizer/categorize.ts` (modified), `src/categorizer/index.ts` (modified), `tests/categorizer/categorize.test.ts` (modified), `tests/categorizer/feedback-loop.test.ts` (created). Key exports: `formatCorrections`, `gatherCorrections`. Notes: `gatherCorrections(merchant)` fetches merchant-specific corrections first, then fills with recent corrections (deduped, max 10); corrections are formatted as few-shot examples in both single and batch prompts; existing categorize tests updated to init DB.

## Phase 6: CLI Commands & Interaction

- [x] `expense-tracker sync` — fetch and parse new emails
  > Done: `src/cli/commands/sync.ts`, `src/cli/router.ts` (modified for async), `src/index.ts` (modified). Key exports: `syncCommand`, `SyncDeps`. Notes: async command orchestrates authenticate → syncEmails → parseEmails → categorizeTransactions → insertTransactions; supports `--since=YYYY-MM-DD` and `--skip-categorize` flags; DI via `SyncDeps` for testability; router now supports async handlers (`routeCommand` returns `Promise<void>`). 9 tests passing.
- [x] `expense-tracker list` — list transactions with filters (date, type, category, bank)
  > Done: `src/cli/commands/list.ts`, `src/index.ts` (modified), `tests/cli/list.test.ts`. Key exports: `listCommand`, `parseListArgs`, `formatTransaction`, `ListDeps`. Notes: supports `--from`, `--to`, `--type`, `--category`, `--direction`, `--bank`, `--limit`, `--offset`, `--review` flags; bank filter is in-memory; tabular output with header; 10 tests passing.
- [x] `expense-tracker summary` — expense summary, category breakdown, monthly trends
  > Done: `src/cli/commands/summary.ts`, `src/index.ts` (modified), `tests/cli/summary.test.ts`. Key exports: `summaryCommand`, `getSummaryData`, `parseSummaryArgs`, `printSummary`, `SummaryData`, `SummaryOptions`. Notes: shows total debits/credits/net, category breakdown (defaults to debits, with % share), monthly trends; supports `--from`, `--to`, `--direction` filters; 10 tests passing.
- [x] `expense-tracker review` — review low-confidence AI-parsed transactions
  > Done: `src/cli/commands/review.ts`, `src/index.ts` (modified), `tests/cli/review.test.ts`. Key exports: `reviewCommand`, `formatForReview`, `ReviewDeps`. Notes: interactive review loop showing each needs_review transaction; actions: approve (clears flag), categorize (updates category + records correction + clears flag), skip, quit; DI via ReviewDeps; 10 tests passing.
- [x] `expense-tracker recategorize <id> <category>` — override a transaction's category
  > Done: already implemented in Phase 5. `src/cli/commands/recategorize.ts`, `tests/cli/recategorize.test.ts`. Key exports: `recategorizeCommand`. Notes: validates category, updates transaction, records correction for AI feedback loop.
- [x] `expense-tracker reparse` — re-parse all raw emails (for parser improvements)
  > Done: `src/cli/commands/reparse.ts`, `src/db/transactions.ts` (added `deleteAllTransactions`), `src/db/index.ts` (modified), `src/index.ts` (modified), `tests/cli/reparse.test.ts`. Key exports: `reparseCommand`, `ReparseDeps`, `deleteAllTransactions`. Notes: deletes all existing transactions, re-parses all raw emails through pipeline, optionally re-categorizes; supports `--skip-categorize` flag; 8 tests passing.

## Phase 7: Chat Mode & Insights

- [x] `expense-tracker chat` — conversational query mode via `claude` CLI
  > Done: `src/cli/commands/chat.ts`, `src/index.ts` (modified), `tests/cli/chat.test.ts`. Key exports: `chatCommand`, `buildDataContext`, `buildChatPrompt`, `ChatDeps`. Notes: supports inline mode (`chat "question"`) and interactive REPL; builds data context from summary, recent transactions, top merchants, monthly trends; sends to Claude CLI with text output; DI via ChatDeps for testing; 10 tests passing.
- [x] Natural language queries against transaction data
  > Done: `src/cli/commands/nl-query.ts` (created), `src/cli/commands/chat.ts` (modified), `tests/cli/nl-query.test.ts` (created), `tests/cli/chat.test.ts` (modified). Key exports: `answerQuery`, `isReadOnlyQuery`, `executeQuery`, `formatResults`, `NlQueryResult`. Notes: two-step NL query: AI generates SQL from user question, executes read-only against DB, AI interprets results; chat command now defaults to NL query mode (`useNlQuery` flag); safety: only SELECT/WITH queries allowed, blocked keywords checked; 20 new tests passing.
- [x] Post-sync alerts (spending anomalies, notable changes)
  > Done: `src/cli/alerts.ts`, `src/cli/commands/sync.ts` (modified), `tests/cli/alerts.test.ts`, `tests/cli/sync.test.ts` (modified). Key exports: `generateAlerts`, `printAlerts`, `getCategorySpending`, `weekStart`, `Alert`. Notes: compares current week spending per category against trailing 4-week average; alerts on 40%+ spikes, new categories, and large transactions (≥₹10,000); integrated into sync command as Step 7; 13 new tests passing.
- [x] Chat mode deeper insights (trends, comparisons, suggestions)
  > Done: `src/cli/insights.ts` (created), `src/cli/commands/chat.ts` (modified), `tests/cli/insights.test.ts` (created). Key exports: `getMonthOverMonth`, `getCategoryTrends`, `getMerchantPatterns`, `generateSuggestions`, `getInsightsData`, `formatInsightsContext`, `InsightsData`, `Suggestion`. Notes: insights module computes month-over-month spending changes, category trends (current vs previous month), recurring merchant patterns (with frequency detection), and actionable suggestions (category spikes, recurring high-spend, top merchant dominance, savings opportunities); integrated into `buildDataContext()` for chat mode; 18 tests passing.

## Future Phases (specs pending)

- [ ] Budget management (set/track budgets per category)
- [ ] TUI interface (interactive terminal UI with tables/charts)
- [ ] Multi-currency support (beyond INR)
- [ ] Additional bank parsers (beyond initial five)
