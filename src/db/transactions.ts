import { getDb } from "./connection";
import type { Transaction } from "../types";

/** Convert a Transaction to DB row parameters. */
function toRow(tx: Transaction) {
  return [
    tx.id,
    tx.emailMessageId,
    tx.date.toISOString(),
    tx.amount,
    tx.currency,
    tx.direction,
    tx.type,
    tx.merchant,
    tx.account ?? null,
    tx.bank ?? null,
    tx.reference ?? null,
    tx.description ?? null,
    tx.category ?? null,
    tx.source,
    tx.confidence ?? null,
    tx.needsReview ? 1 : 0,
  ];
}

/** Convert a DB row to a Transaction. */
export function rowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: row.id as string,
    emailMessageId: row.email_message_id as string,
    date: new Date(row.date as string),
    amount: row.amount as number,
    currency: row.currency as string,
    direction: row.direction as Transaction["direction"],
    type: row.type as Transaction["type"],
    merchant: row.merchant as string,
    account: (row.account as string) ?? "",
    bank: (row.bank as string) ?? "",
    reference: (row.reference as string) ?? undefined,
    description: (row.description as string) ?? undefined,
    category: (row.category as string) ?? undefined,
    source: row.source as Transaction["source"],
    confidence: row.confidence != null ? (row.confidence as number) : undefined,
    needsReview: (row.needs_review as number) === 1,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

const INSERT_SQL = `
  INSERT OR IGNORE INTO transactions
    (id, email_message_id, date, amount, currency, direction, type, merchant,
     account, bank, reference, description, category, source, confidence, needs_review)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/** Insert a transaction, ignoring duplicates (composite dedup key). */
export function insertTransaction(tx: Transaction): boolean {
  const db = getDb();
  const result = db.prepare(INSERT_SQL).run(...toRow(tx));
  return result.changes > 0;
}

/** Insert multiple transactions in a single DB transaction. Returns count inserted. */
export function insertTransactions(txs: Transaction[]): number {
  const db = getDb();
  const stmt = db.prepare(INSERT_SQL);
  let inserted = 0;
  const run = db.transaction(() => {
    for (const tx of txs) {
      const result = stmt.run(...toRow(tx));
      if (result.changes > 0) inserted++;
    }
  });
  run();
  return inserted;
}

/** Get a transaction by ID. */
export function getTransaction(id: string): Transaction | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM transactions WHERE id = ?")
    .get(id) as Record<string, unknown> | null;
  return row ? rowToTransaction(row) : null;
}

/** Get all transactions for a given email message ID. */
export function getTransactionsByEmail(
  emailMessageId: string,
): Transaction[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM transactions WHERE email_message_id = ? ORDER BY date",
    )
    .all(emailMessageId) as Record<string, unknown>[];
  return rows.map(rowToTransaction);
}

export interface ListTransactionsOptions {
  startDate?: string; // ISO 8601
  endDate?: string; // ISO 8601
  type?: Transaction["type"];
  category?: string;
  direction?: Transaction["direction"];
  needsReview?: boolean;
  limit?: number;
  offset?: number;
}

/** List transactions with optional filters. */
export function listTransactions(
  opts: ListTransactionsOptions = {},
): Transaction[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts.startDate) {
    conditions.push("date >= ?");
    params.push(opts.startDate);
  }
  if (opts.endDate) {
    conditions.push("date <= ?");
    params.push(opts.endDate);
  }
  if (opts.type) {
    conditions.push("type = ?");
    params.push(opts.type);
  }
  if (opts.category) {
    conditions.push("category = ?");
    params.push(opts.category);
  }
  if (opts.direction) {
    conditions.push("direction = ?");
    params.push(opts.direction);
  }
  if (opts.needsReview !== undefined) {
    conditions.push("needs_review = ?");
    params.push(opts.needsReview ? 1 : 0);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  let sql = `SELECT * FROM transactions ${where} ORDER BY date DESC`;

  if (opts.limit) {
    sql += " LIMIT ?";
    params.push(opts.limit);
    if (opts.offset) {
      sql += " OFFSET ?";
      params.push(opts.offset);
    }
  }

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToTransaction);
}

/** Update a transaction's merchant. */
export function updateTransactionMerchant(
  id: string,
  merchant: string,
): boolean {
  const db = getDb();
  const result = db
    .prepare(
      "UPDATE transactions SET merchant = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(merchant, id);
  return result.changes > 0;
}

/** Update a transaction's category. */
export function updateTransactionCategory(
  id: string,
  category: string,
): boolean {
  const db = getDb();
  const result = db
    .prepare(
      "UPDATE transactions SET category = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(category, id);
  return result.changes > 0;
}

/** Update a transaction's needs_review flag. */
export function updateTransactionReview(
  id: string,
  needsReview: boolean,
): boolean {
  const db = getDb();
  const result = db
    .prepare(
      "UPDATE transactions SET needs_review = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(needsReview ? 1 : 0, id);
  return result.changes > 0;
}

/** Delete a transaction by ID. */
export function deleteTransaction(id: string): boolean {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM transactions WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

/** Delete all transactions. Returns count deleted. */
export function deleteAllTransactions(): number {
  const db = getDb();
  const result = db.prepare("DELETE FROM transactions").run();
  return result.changes;
}

/** Count transactions, optionally filtered. */
export function countTransactions(
  opts: Pick<ListTransactionsOptions, "needsReview" | "type" | "category"> = {},
): number {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts.needsReview !== undefined) {
    conditions.push("needs_review = ?");
    params.push(opts.needsReview ? 1 : 0);
  }
  if (opts.type) {
    conditions.push("type = ?");
    params.push(opts.type);
  }
  if (opts.category) {
    conditions.push("category = ?");
    params.push(opts.category);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM transactions ${where}`)
    .get(...params) as Record<string, number>;
  return row.count;
}
