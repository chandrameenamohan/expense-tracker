/**
 * Natural language query module.
 * Translates user questions into SQL queries via Claude CLI,
 * executes them safely (read-only), and interprets results.
 */

import type { ClaudeCli } from "../../categorizer/claude-cli";
import { getDb } from "../../db/connection";

const SCHEMA_CONTEXT = `
The SQLite database has these tables:

transactions (
  id TEXT PRIMARY KEY,
  email_message_id TEXT NOT NULL,
  date TEXT NOT NULL,          -- ISO 8601 format, e.g. '2025-01-15T10:00:00.000Z'
  amount REAL NOT NULL,        -- always positive
  currency TEXT DEFAULT 'INR',
  direction TEXT NOT NULL,     -- 'debit' or 'credit'
  type TEXT NOT NULL,          -- 'upi', 'credit_card', 'bank_transfer', 'sip', 'loan'
  merchant TEXT NOT NULL,
  account TEXT,
  bank TEXT,
  reference TEXT,
  description TEXT,
  category TEXT,               -- Food, Transport, Shopping, Bills, Entertainment, Health, Education, Investment, Transfer, Other
  source TEXT NOT NULL,        -- 'regex' or 'ai'
  confidence REAL,
  needs_review INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
)

categories (name TEXT PRIMARY KEY, parent TEXT, description TEXT)
`.trim();

const SQL_GENERATION_PROMPT = `You are a SQL query generator for an expense tracker SQLite database.
Given a user question, generate a single SELECT query to answer it.

${SCHEMA_CONTEXT}

Rules:
- Output ONLY the SQL query, nothing else. No explanation, no markdown fences.
- Only SELECT statements. Never INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or any write operation.
- Use strftime or substr for date operations. Dates are ISO 8601 strings.
- For "this month" or "last month", use substr(date, 1, 7) comparisons.
- Amount is always positive; use the direction column to distinguish debits/credits.
- Keep queries simple and efficient.
- If the question cannot be answered from the schema, output: SELECT 'CANNOT_ANSWER' as error;

User question: `;

const INTERPRET_PROMPT = `You are a personal expense analyst. The user asked a question about their spending.
Below are the SQL query results. Interpret them clearly and concisely using Indian Rupee (₹) formatting.
If the results are empty, say so. Do not explain the SQL.

User question: `;

/** Check if a SQL string is read-only (SELECT only). */
export function isReadOnlyQuery(sql: string): boolean {
  const normalized = sql.trim().replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  const upper = normalized.toUpperCase();

  // Must start with SELECT or WITH (for CTEs)
  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    return false;
  }

  // Block dangerous keywords
  const blocked = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|REINDEX|VACUUM)\b/i;
  return !blocked.test(normalized);
}

/** Execute a read-only SQL query and return results. */
export function executeQuery(sql: string): { rows: Record<string, unknown>[]; error?: string } {
  if (!isReadOnlyQuery(sql)) {
    return { rows: [], error: "Query rejected: only SELECT statements are allowed." };
  }

  try {
    const db = getDb();
    const rows = db.prepare(sql).all() as Record<string, unknown>[];
    return { rows };
  } catch (err) {
    return { rows: [], error: `SQL error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Format query results as a readable string. */
export function formatResults(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "No results found.";

  const keys = Object.keys(rows[0]);
  const lines: string[] = [];
  lines.push(keys.join(" | "));
  lines.push(keys.map((k) => "-".repeat(k.length)).join("-+-"));
  for (const row of rows.slice(0, 100)) {
    lines.push(keys.map((k) => String(row[k] ?? "")).join(" | "));
  }
  if (rows.length > 100) {
    lines.push(`... and ${rows.length - 100} more rows`);
  }
  return lines.join("\n");
}

export interface NlQueryResult {
  answer: string;
  sql?: string;
  rows?: Record<string, unknown>[];
  error?: string;
}

/**
 * Answer a natural language question about transaction data.
 * Two-step: generate SQL via AI, execute, then interpret results via AI.
 */
export function answerQuery(cli: ClaudeCli, question: string): NlQueryResult {
  // Step 1: Generate SQL
  const sqlResult = cli.run({
    prompt: SQL_GENERATION_PROMPT + question,
    outputFormat: "text",
  });

  if (!sqlResult.success) {
    return { answer: `Could not generate query: ${sqlResult.error}`, error: sqlResult.error };
  }

  const sql = sqlResult.output.trim().replace(/^```(?:sql)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();

  if (sql.includes("CANNOT_ANSWER")) {
    return { answer: "I can't answer that question from the available transaction data.", sql };
  }

  // Step 2: Execute SQL
  const { rows, error } = executeQuery(sql);

  if (error) {
    return { answer: `Query failed: ${error}`, sql, error };
  }

  // Step 3: Interpret results
  const formatted = formatResults(rows);
  const interpretResult = cli.run({
    prompt: `${INTERPRET_PROMPT}${question}\n\nQuery results:\n${formatted}`,
    outputFormat: "text",
  });

  if (!interpretResult.success) {
    // Fall back to raw results
    return { answer: formatted, sql, rows };
  }

  return { answer: interpretResult.output, sql, rows };
}
