import { getDb } from "./connection";
import type { Transaction } from "../types";
import { rowToTransaction, listTransactions, countTransactions, updateTransactionReview } from "./transactions";

export interface ReviewQueueOptions {
  limit?: number;
  offset?: number;
  source?: Transaction["source"];
}

/** Get all transactions needing review, ordered by date descending. */
export function getReviewQueue(opts: ReviewQueueOptions = {}): Transaction[] {
  if (opts.source) {
    const db = getDb();
    const params: (string | number)[] = [opts.source];
    let sql = "SELECT * FROM transactions WHERE needs_review = 1 AND deleted = 0 AND source = ? ORDER BY date DESC";
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
  return listTransactions({ needsReview: true, limit: opts.limit, offset: opts.offset });
}

/** Count transactions needing review. */
export function getReviewQueueCount(): number {
  return countTransactions({ needsReview: true });
}

/** Mark a transaction as reviewed (clears needs_review flag). */
export function resolveReview(id: string): boolean {
  return updateTransactionReview(id, false);
}

/** Mark a transaction as needing review. */
export function flagForReview(id: string): boolean {
  return updateTransactionReview(id, true);
}
