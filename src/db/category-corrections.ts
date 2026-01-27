import { getDb } from "./connection";
import type { CategoryCorrection } from "../types";

function rowToCorrection(row: Record<string, unknown>): CategoryCorrection {
  return {
    id: row.id as number,
    merchant: row.merchant as string,
    description: (row.description as string) ?? undefined,
    originalCategory: row.original_category as string,
    correctedCategory: row.corrected_category as string,
    createdAt: new Date(row.created_at as string),
  };
}

/** Insert a category correction record */
export function insertCategoryCorrection(
  merchant: string,
  originalCategory: string,
  correctedCategory: string,
  description?: string,
): CategoryCorrection {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO category_corrections (merchant, description, original_category, corrected_category)
     VALUES (?, ?, ?, ?)`,
  );
  const result = stmt.run(merchant, description ?? null, originalCategory, correctedCategory);
  const id = Number(result.lastInsertRowid);
  return getCorrection(id)!;
}

/** Get a single correction by ID */
export function getCorrection(id: number): CategoryCorrection | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM category_corrections WHERE id = ?").get(id) as Record<string, unknown> | null;
  return row ? rowToCorrection(row) : null;
}

/** Get corrections for a specific merchant (most recent first) */
export function getCorrectionsByMerchant(
  merchant: string,
  limit = 10,
): CategoryCorrection[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM category_corrections WHERE merchant = ? ORDER BY id DESC LIMIT ?",
    )
    .all(merchant, limit) as Record<string, unknown>[];
  return rows.map(rowToCorrection);
}

/** Get all recent corrections (most recent first) */
export function getRecentCorrections(limit = 50): CategoryCorrection[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM category_corrections ORDER BY id DESC LIMIT ?",
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToCorrection);
}
