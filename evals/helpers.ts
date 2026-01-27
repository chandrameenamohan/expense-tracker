/**
 * Shared helpers for eval runners: in-memory DB setup, fixture loading.
 */

import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { _setDb, _resetDb } from "../src/db/connection";
import { runMigrations } from "../src/db/migrate";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "src", "db", "migrations");

/** Create an in-memory SQLite DB with all migrations applied */
export function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  _setDb(db);
  runMigrations(db, MIGRATIONS_DIR);
  return db;
}

/** Tear down test DB */
export function teardownTestDb(): void {
  _resetDb();
}

/** Load a JSON fixture file from evals/datasets/ */
export function loadFixtures<T>(relativePath: string): T {
  const fullPath = join(import.meta.dir, "datasets", relativePath);
  const content = readFileSync(fullPath, "utf-8");
  return JSON.parse(content) as T;
}

/** Seed transactions into the DB */
export function seedTransactions(
  db: Database,
  transactions: Array<{
    id: string;
    emailMessageId: string;
    date: string;
    amount: number;
    currency?: string;
    direction: string;
    type: string;
    merchant: string;
    account?: string;
    bank?: string;
    reference?: string;
    description?: string;
    category?: string;
    source?: string;
    confidence?: number;
    needsReview?: boolean;
  }>,
): void {
  // Ensure raw_email exists for FK
  const insertEmail = db.prepare(
    "INSERT OR IGNORE INTO raw_emails (message_id, from_address, subject, date, body_text) VALUES (?, ?, ?, ?, ?)",
  );
  const insertTx = db.prepare(
    `INSERT OR IGNORE INTO transactions
     (id, email_message_id, date, amount, currency, direction, type, merchant,
      account, bank, reference, description, category, source, confidence, needs_review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const run = db.transaction(() => {
    for (const tx of transactions) {
      insertEmail.run(tx.emailMessageId, "test@bank.com", "Test", tx.date, "test");
      insertTx.run(
        tx.id,
        tx.emailMessageId,
        tx.date,
        tx.amount,
        tx.currency ?? "INR",
        tx.direction,
        tx.type,
        tx.merchant,
        tx.account ?? null,
        tx.bank ?? null,
        tx.reference ?? null,
        tx.description ?? null,
        tx.category ?? null,
        tx.source ?? "regex",
        tx.confidence ?? null,
        tx.needsReview ? 1 : 0,
      );
    }
  });
  run();
}
