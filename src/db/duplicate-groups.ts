/**
 * Database helpers for the duplicate_groups table.
 */

import { getDb } from "./connection";

export interface DuplicateGroup {
  id: number;
  keptTransactionId: string;
  duplicateTransactionId: string;
  reason: string;
  confidence: number | null;
  createdAt: string;
}

/** Record a transaction as a duplicate of another. */
export function markAsDuplicate(
  duplicateTxId: string,
  keptTxId: string,
  reason: string,
  confidence?: number,
): boolean {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO duplicate_groups (kept_transaction_id, duplicate_transaction_id, reason, confidence)
       VALUES (?, ?, ?, ?)`,
    )
    .run(keptTxId, duplicateTxId, reason, confidence ?? null);
  return result.changes > 0;
}

/** Get all duplicate records where the given transaction is the kept one. */
export function getDuplicatesFor(keptTxId: string): DuplicateGroup[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM duplicate_groups WHERE kept_transaction_id = ?")
    .all(keptTxId) as Record<string, unknown>[];
  return rows.map(rowToDuplicateGroup);
}

/** Get the duplicate group record for a transaction marked as duplicate. */
export function getDuplicateOf(duplicateTxId: string): DuplicateGroup | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM duplicate_groups WHERE duplicate_transaction_id = ?")
    .get(duplicateTxId) as Record<string, unknown> | null;
  return row ? rowToDuplicateGroup(row) : null;
}

function rowToDuplicateGroup(row: Record<string, unknown>): DuplicateGroup {
  return {
    id: row.id as number,
    keptTransactionId: row.kept_transaction_id as string,
    duplicateTransactionId: row.duplicate_transaction_id as string,
    reason: row.reason as string,
    confidence: row.confidence as number | null,
    createdAt: row.created_at as string,
  };
}
