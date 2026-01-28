/**
 * SQL-based candidate finder for duplicate transactions.
 * Finds transaction pairs with same amount, direction, and date within ±1 day,
 * but from different emails (cross-email duplicates only).
 */

import { getDb } from "../db/connection";
import { getConfig } from "../config";

export interface DuplicateCandidate {
  txId1: string;
  txId2: string;
  amount: number;
  direction: string;
  date1: string;
  date2: string;
  merchant1: string;
  merchant2: string;
}

/**
 * Find candidate duplicate pairs among the given transaction IDs.
 * If no IDs provided, scans all transactions.
 */
export function findCandidates(txIds?: string[]): DuplicateCandidate[] {
  const db = getDb();

  let sql: string;
  const params: string[] = [];

  if (txIds && txIds.length > 0) {
    const placeholders = txIds.map(() => "?").join(",");
    // At least one of the pair must be from the newly inserted set
    sql = `
      SELECT
        t1.id as tx_id_1, t2.id as tx_id_2,
        t1.amount, t1.direction,
        t1.date as date1, t2.date as date2,
        t1.merchant as merchant1, t2.merchant as merchant2
      FROM transactions t1
      JOIN transactions t2
        ON t1.amount = t2.amount
        AND t1.direction = t2.direction
        AND t1.id < t2.id
        AND t1.email_message_id != t2.email_message_id
        AND abs(julianday(t1.date) - julianday(t2.date)) <= ${getConfig().dedup.dateToleranceDays}
      WHERE t1.id IN (${placeholders}) OR t2.id IN (${placeholders})
    `;
    params.push(...txIds, ...txIds);
  } else {
    sql = `
      SELECT
        t1.id as tx_id_1, t2.id as tx_id_2,
        t1.amount, t1.direction,
        t1.date as date1, t2.date as date2,
        t1.merchant as merchant1, t2.merchant as merchant2
      FROM transactions t1
      JOIN transactions t2
        ON t1.amount = t2.amount
        AND t1.direction = t2.direction
        AND t1.id < t2.id
        AND t1.email_message_id != t2.email_message_id
        AND abs(julianday(t1.date) - julianday(t2.date)) <= ${getConfig().dedup.dateToleranceDays}
    `;
  }

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];

  return rows.map((row) => ({
    txId1: row.tx_id_1 as string,
    txId2: row.tx_id_2 as string,
    amount: row.amount as number,
    direction: row.direction as string,
    date1: row.date1 as string,
    date2: row.date2 as string,
    merchant1: row.merchant1 as string,
    merchant2: row.merchant2 as string,
  }));
}
