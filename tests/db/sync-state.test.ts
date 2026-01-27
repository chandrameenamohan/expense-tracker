import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { _setDb, _resetDb, closeDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import {
  getSyncState,
  setSyncState,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
  getTotalSyncedCount,
  incrementTotalSyncedCount,
  getLastMessageId,
  setLastMessageId,
  getAllSyncState,
} from "../../src/db/sync-state";

describe("sync state", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");
    _setDb(db);
    runMigrations(db);
  });

  afterEach(() => {
    closeDb();
    _resetDb();
  });

  test("getSyncState returns null for missing key", () => {
    expect(getSyncState("nonexistent")).toBeNull();
  });

  test("setSyncState inserts and retrieves a value", () => {
    setSyncState("test_key", "test_value");
    expect(getSyncState("test_key")).toBe("test_value");
  });

  test("setSyncState upserts on conflict", () => {
    setSyncState("key", "value1");
    setSyncState("key", "value2");
    expect(getSyncState("key")).toBe("value2");
  });

  test("getLastSyncTimestamp returns null when never synced", () => {
    expect(getLastSyncTimestamp()).toBeNull();
  });

  test("setLastSyncTimestamp and getLastSyncTimestamp round-trip", () => {
    const date = new Date("2025-06-15T12:00:00.000Z");
    setLastSyncTimestamp(date);
    const result = getLastSyncTimestamp();
    expect(result).toEqual(date);
  });

  test("getTotalSyncedCount returns 0 when never set", () => {
    expect(getTotalSyncedCount()).toBe(0);
  });

  test("incrementTotalSyncedCount accumulates", () => {
    incrementTotalSyncedCount(5);
    expect(getTotalSyncedCount()).toBe(5);
    incrementTotalSyncedCount(3);
    expect(getTotalSyncedCount()).toBe(8);
  });

  test("getLastMessageId returns null when never set", () => {
    expect(getLastMessageId()).toBeNull();
  });

  test("setLastMessageId and getLastMessageId round-trip", () => {
    setLastMessageId("msg_abc123");
    expect(getLastMessageId()).toBe("msg_abc123");
  });

  test("setLastMessageId overwrites previous value", () => {
    setLastMessageId("msg_1");
    setLastMessageId("msg_2");
    expect(getLastMessageId()).toBe("msg_2");
  });

  test("getAllSyncState returns empty record when no state", () => {
    expect(getAllSyncState()).toEqual({});
  });

  test("getAllSyncState returns all entries", () => {
    setLastSyncTimestamp(new Date("2025-06-15T12:00:00.000Z"));
    setLastMessageId("msg_xyz");
    incrementTotalSyncedCount(10);

    const state = getAllSyncState();
    expect(state.last_sync_timestamp).toBe("2025-06-15T12:00:00.000Z");
    expect(state.last_message_id).toBe("msg_xyz");
    expect(state.total_synced_count).toBe("10");
    expect(Object.keys(state)).toHaveLength(3);
  });
});
