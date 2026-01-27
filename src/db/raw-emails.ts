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

/** Insert multiple raw emails in a single transaction. Returns count inserted. */
export function insertRawEmails(emails: RawEmail[]): number {
  const { insertedIds } = insertRawEmailsWithIds(emails);
  return insertedIds.length;
}

/** Insert multiple raw emails, returning both count and the message IDs that were actually inserted. */
export function insertRawEmailsWithIds(emails: RawEmail[]): { insertedIds: string[] } {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO raw_emails (message_id, from_address, subject, date, body_text, body_html)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertedIds: string[] = [];
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
      if (result.changes > 0) insertedIds.push(email.messageId);
    }
  });
  tx();
  return { insertedIds };
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

/** Get raw emails by a list of message IDs. */
export function getRawEmailsByIds(messageIds: string[]): RawEmail[] {
  if (messageIds.length === 0) return [];
  const db = getDb();
  const placeholders = messageIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT * FROM raw_emails WHERE message_id IN (${placeholders}) ORDER BY date DESC`)
    .all(...messageIds) as Record<string, unknown>[];
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
