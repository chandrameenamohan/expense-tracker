import { getDb } from "./connection";
import type { RawEmail } from "../types";

/** Insert a raw email, ignoring duplicates (same message_id). */
export function insertRawEmail(email: RawEmail): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO raw_emails (message_id, from_address, subject, date, body_text, body_html)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    email.messageId,
    email.from,
    email.subject,
    email.date.toISOString(),
    email.bodyText,
    email.bodyHtml ?? null,
  );
}

/** Insert multiple raw emails in a single transaction. */
export function insertRawEmails(emails: RawEmail[]): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO raw_emails (message_id, from_address, subject, date, body_text, body_html)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  const tx = db.transaction(() => {
    for (const email of emails) {
      const result = stmt.run(
        email.messageId,
        email.from,
        email.subject,
        email.date.toISOString(),
        email.bodyText,
        email.bodyHtml ?? null,
      );
      if (result.changes > 0) inserted++;
    }
  });
  tx();
  return inserted;
}

/** Get a raw email by message_id. */
export function getRawEmail(messageId: string): RawEmail | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM raw_emails WHERE message_id = ?").get(messageId) as Record<string, unknown> | null;
  return row ? rowToRawEmail(row) : null;
}

/** Get all raw emails, ordered by date descending. */
export function getAllRawEmails(): RawEmail[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM raw_emails ORDER BY date DESC").all() as Record<string, unknown>[];
  return rows.map(rowToRawEmail);
}

/** Check if a raw email exists by message_id. */
export function rawEmailExists(messageId: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT 1 FROM raw_emails WHERE message_id = ?").get(messageId);
  return row != null;
}

function rowToRawEmail(row: Record<string, unknown>): RawEmail {
  return {
    messageId: row.message_id as string,
    from: row.from_address as string,
    subject: row.subject as string,
    date: new Date(row.date as string),
    bodyText: row.body_text as string,
    bodyHtml: (row.body_html as string) ?? undefined,
    fetchedAt: row.fetched_at ? new Date(row.fetched_at as string) : undefined,
  };
}
