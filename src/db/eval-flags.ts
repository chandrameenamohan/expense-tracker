import { getDb } from "./connection";

export interface EvalFlag {
  id: number;
  transactionId: string;
  verdict: "correct" | "wrong";
  notes?: string;
  createdAt: Date;
}

function rowToEvalFlag(row: Record<string, unknown>): EvalFlag {
  return {
    id: row.id as number,
    transactionId: row.transaction_id as string,
    verdict: row.verdict as "correct" | "wrong",
    notes: (row.notes as string) ?? undefined,
    createdAt: new Date(row.created_at as string),
  };
}

export function insertEvalFlag(
  transactionId: string,
  verdict: "correct" | "wrong",
  notes?: string,
): EvalFlag {
  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO eval_flags (transaction_id, verdict, notes) VALUES (?, ?, ?)",
    )
    .run(transactionId, verdict, notes ?? null);
  const id = Number(result.lastInsertRowid);
  return getEvalFlag(id)!;
}

export function getEvalFlag(id: number): EvalFlag | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM eval_flags WHERE id = ?")
    .get(id) as Record<string, unknown> | null;
  return row ? rowToEvalFlag(row) : null;
}

export function getEvalFlagsByTransaction(
  transactionId: string,
): EvalFlag[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM eval_flags WHERE transaction_id = ? ORDER BY id DESC",
    )
    .all(transactionId) as Record<string, unknown>[];
  return rows.map(rowToEvalFlag);
}

export function getAllEvalFlags(): EvalFlag[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM eval_flags ORDER BY id DESC")
    .all() as Record<string, unknown>[];
  return rows.map(rowToEvalFlag);
}
