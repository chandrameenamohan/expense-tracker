import type { OAuth2Client } from "googleapis-common";
import { listMessageIds } from "./query";
import { fetchMessages } from "./fetch";
import { insertRawEmailsWithIds } from "../db/raw-emails";
import {
  getLastSyncTimestamp,
  setLastSyncTimestamp,
  setLastMessageId,
  incrementTotalSyncedCount,
} from "../db/sync-state";

import { getConfig } from "../config";

/** Default lookback for first sync */
function defaultSinceDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - getConfig().sync.defaultLookbackMonths);
  return d;
}

export interface SyncOptions {
  /** Override start date for first sync (--since flag) */
  since?: Date;
}

export interface SyncResult {
  messagesFound: number;
  newEmailsStored: number;
  newMessageIds: string[];
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
  const afterDate = options.since ?? lastSync ?? defaultSinceDate();

  const messageIds = await listMessageIds(client, afterDate);
  const syncTimestamp = new Date();

  if (messageIds.length === 0) {
    setLastSyncTimestamp(syncTimestamp);
    return { messagesFound: 0, newEmailsStored: 0, newMessageIds: [], syncTimestamp };
  }

  const emails = await fetchMessages(client, messageIds);
  const { insertedIds } = insertRawEmailsWithIds(emails);

  setLastSyncTimestamp(syncTimestamp);
  setLastMessageId(messageIds[0]);
  incrementTotalSyncedCount(insertedIds.length);

  return {
    messagesFound: messageIds.length,
    newEmailsStored: insertedIds.length,
    newMessageIds: insertedIds,
    syncTimestamp,
  };
}
