import type { OAuth2Client } from "googleapis-common";
import { listMessageIds } from "./query";
import { fetchMessages } from "./fetch";
import { insertRawEmails } from "../db/raw-emails";
import {
  getLastSyncTimestamp,
  setLastSyncTimestamp,
  setLastMessageId,
  incrementTotalSyncedCount,
} from "../db/sync-state";

/** Default lookback for first sync: 12 months */
function defaultSinceDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 12);
  return d;
}

export interface SyncOptions {
  /** Override start date for first sync (--since flag) */
  since?: Date;
}

export interface SyncResult {
  messagesFound: number;
  newEmailsStored: number;
  syncTimestamp: Date;
}

/**
 * Performs an incremental email sync.
 * - First sync: fetches from `since` date (default 12 months ago).
 * - Subsequent syncs: fetches only emails newer than last sync timestamp.
 */
export async function syncEmails(
  client: OAuth2Client,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const lastSync = getLastSyncTimestamp();
  const afterDate = lastSync ?? options.since ?? defaultSinceDate();

  const messageIds = await listMessageIds(client, afterDate);
  const syncTimestamp = new Date();

  if (messageIds.length === 0) {
    setLastSyncTimestamp(syncTimestamp);
    return { messagesFound: 0, newEmailsStored: 0, syncTimestamp };
  }

  const emails = await fetchMessages(client, messageIds);
  const newCount = insertRawEmails(emails);

  setLastSyncTimestamp(syncTimestamp);
  setLastMessageId(messageIds[0]);
  incrementTotalSyncedCount(newCount);

  return {
    messagesFound: messageIds.length,
    newEmailsStored: newCount,
    syncTimestamp,
  };
}
