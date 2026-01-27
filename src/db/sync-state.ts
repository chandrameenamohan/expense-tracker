import { getDb } from "./connection";

/** Get a sync state value by key. */
export function getSyncState(key: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM sync_state WHERE key = ?")
    .get(key) as { value: string } | null;
  return row?.value ?? null;
}

/** Set a sync state value (upsert). */
export function setSyncState(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO sync_state (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(key, value);
}

/** Get the last sync timestamp as a Date, or null if never synced. */
export function getLastSyncTimestamp(): Date | null {
  const value = getSyncState("last_sync_timestamp");
  return value ? new Date(value) : null;
}

/** Set the last sync timestamp. */
export function setLastSyncTimestamp(date: Date): void {
  setSyncState("last_sync_timestamp", date.toISOString());
}

/** Get total synced email count. */
export function getTotalSyncedCount(): number {
  const value = getSyncState("total_synced_count");
  return value ? Number.parseInt(value, 10) : 0;
}

/** Increment total synced count by n. */
export function incrementTotalSyncedCount(n: number): void {
  const current = getTotalSyncedCount();
  setSyncState("total_synced_count", String(current + n));
}

/** Get the last synced message ID, or null if never synced. */
export function getLastMessageId(): string | null {
  return getSyncState("last_message_id");
}

/** Set the last synced message ID. */
export function setLastMessageId(messageId: string): void {
  setSyncState("last_message_id", messageId);
}

/** Get all sync state entries as a key-value record. */
export function getAllSyncState(): Record<string, string> {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, value FROM sync_state")
    .all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}
