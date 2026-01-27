#!/usr/bin/env bun

/**
 * Export eval datasets from the production DB.
 * Reads category_corrections, eval_flags, transactions, raw_emails
 * and writes JSON fixtures to evals/datasets/.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../src/db/connection";
import { runMigrations } from "../src/db/migrate";

const DATASETS_DIR = join(import.meta.dir, "datasets");

interface ExportedParserCase {
  id: string;
  description: string;
  input: {
    messageId: string;
    from: string;
    subject: string;
    date: string;
    bodyText: string;
    bodyHtml?: string;
  };
  expected: {
    amount: number;
    direction: string;
    type: string;
    merchant: string;
    bank?: string;
    account?: string;
  };
}

interface ExportedCategorizationCase {
  id: string;
  description: string;
  transaction: {
    merchant: string;
    amount: number;
    type: string;
    direction: string;
    description?: string;
  };
  expectedCategory: string;
}

function exportParserCases(): ExportedParserCase[] {
  const db = getDb();
  const cases: ExportedParserCase[] = [];

  // AI fallback cases: transactions parsed by AI, joined with raw_emails
  const rows = db
    .prepare(
      `SELECT t.*, e.message_id, e.from_address, e.subject, e.date as email_date,
              e.body_text, e.body_html
       FROM transactions t
       JOIN raw_emails e ON t.email_message_id = e.message_id
       WHERE t.source = 'ai'
       ORDER BY t.created_at DESC
       LIMIT 50`,
    )
    .all() as Record<string, unknown>[];

  for (const row of rows) {
    cases.push({
      id: `ai-${row.id}`,
      description: `AI-parsed: ${row.merchant} ₹${row.amount}`,
      input: {
        messageId: row.message_id as string,
        from: row.from_address as string,
        subject: row.subject as string,
        date: row.email_date as string,
        bodyText: row.body_text as string,
        bodyHtml: (row.body_html as string) ?? undefined,
      },
      expected: {
        amount: row.amount as number,
        direction: row.direction as string,
        type: row.type as string,
        merchant: row.merchant as string,
        bank: (row.bank as string) ?? undefined,
        account: (row.account as string) ?? undefined,
      },
    });
  }

  // Flagged-correct transactions
  const flaggedRows = db
    .prepare(
      `SELECT t.*, e.message_id, e.from_address, e.subject, e.date as email_date,
              e.body_text, e.body_html, f.verdict
       FROM eval_flags f
       JOIN transactions t ON f.transaction_id = t.id
       JOIN raw_emails e ON t.email_message_id = e.message_id
       WHERE f.verdict = 'correct'
       ORDER BY f.created_at DESC
       LIMIT 50`,
    )
    .all() as Record<string, unknown>[];

  for (const row of flaggedRows) {
    cases.push({
      id: `flagged-${row.id}`,
      description: `Flagged correct: ${row.merchant} ₹${row.amount}`,
      input: {
        messageId: row.message_id as string,
        from: row.from_address as string,
        subject: row.subject as string,
        date: row.email_date as string,
        bodyText: row.body_text as string,
        bodyHtml: (row.body_html as string) ?? undefined,
      },
      expected: {
        amount: row.amount as number,
        direction: row.direction as string,
        type: row.type as string,
        merchant: row.merchant as string,
        bank: (row.bank as string) ?? undefined,
        account: (row.account as string) ?? undefined,
      },
    });
  }

  return cases;
}

function exportCategorizationCases(): ExportedCategorizationCase[] {
  const db = getDb();
  const cases: ExportedCategorizationCase[] = [];

  // From category_corrections: user corrected = ground truth
  const corrections = db
    .prepare(
      `SELECT cc.*, t.amount, t.type, t.direction, t.description
       FROM category_corrections cc
       LEFT JOIN transactions t ON cc.merchant = t.merchant
       GROUP BY cc.id
       ORDER BY cc.created_at DESC
       LIMIT 100`,
    )
    .all() as Record<string, unknown>[];

  for (const row of corrections) {
    cases.push({
      id: `correction-${row.id}`,
      description: `Corrected: ${row.merchant} ${row.original_category} → ${row.corrected_category}`,
      transaction: {
        merchant: row.merchant as string,
        amount: (row.amount as number) ?? 500,
        type: (row.type as string) ?? "upi",
        direction: (row.direction as string) ?? "debit",
        description: (row.description as string) ?? undefined,
      },
      expectedCategory: row.corrected_category as string,
    });
  }

  // Flagged-correct transactions with categories
  const flagged = db
    .prepare(
      `SELECT t.*
       FROM eval_flags f
       JOIN transactions t ON f.transaction_id = t.id
       WHERE f.verdict = 'correct' AND t.category IS NOT NULL
       ORDER BY f.created_at DESC
       LIMIT 50`,
    )
    .all() as Record<string, unknown>[];

  for (const row of flagged) {
    cases.push({
      id: `flagged-cat-${row.id}`,
      description: `Flagged correct: ${row.merchant} → ${row.category}`,
      transaction: {
        merchant: row.merchant as string,
        amount: row.amount as number,
        type: row.type as string,
        direction: row.direction as string,
        description: (row.description as string) ?? undefined,
      },
      expectedCategory: row.category as string,
    });
  }

  return cases;
}

// Run export
runMigrations();

console.log("Exporting eval datasets from production DB...\n");

const parserCases = exportParserCases();
if (parserCases.length > 0) {
  const dir = join(DATASETS_DIR, "parser");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "exported.json");
  writeFileSync(path, JSON.stringify(parserCases, null, 2));
  console.log(`  Parser: ${parserCases.length} cases → ${path}`);
} else {
  console.log("  Parser: no cases to export");
}

const categorizationCases = exportCategorizationCases();
if (categorizationCases.length > 0) {
  const dir = join(DATASETS_DIR, "categorization");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "exported.json");
  writeFileSync(path, JSON.stringify(categorizationCases, null, 2));
  console.log(`  Categorization: ${categorizationCases.length} cases → ${path}`);
} else {
  console.log("  Categorization: no cases to export");
}

console.log("\nDone.");
