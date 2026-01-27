import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { _setDb, _resetDb, closeDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import {
  getLastSyncTimestamp,
  getTotalSyncedCount,
} from "../../src/db/sync-state";
import { getAllRawEmails } from "../../src/db/raw-emails";
import type { RawEmail } from "../../src/types";

// Mock gmail modules
const mockListMessageIds = mock(() => Promise.resolve([] as string[]));
const mockFetchMessages = mock(() => Promise.resolve([] as RawEmail[]));

mock.module("../../src/gmail/query", () => ({
  listMessageIds: mockListMessageIds,
  buildQuery: () => "",
}));

mock.module("../../src/gmail/fetch", () => ({
  fetchMessages: mockFetchMessages,
}));

// Import after mocking
const { syncEmails } = await import("../../src/gmail/sync");

function makeFakeClient(): any {
  return {};
}

describe("syncEmails", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");
    _setDb(db);
    runMigrations(db);
    mockListMessageIds.mockReset();
    mockFetchMessages.mockReset();
    mockListMessageIds.mockResolvedValue([]);
    mockFetchMessages.mockResolvedValue([]);
  });

  afterEach(() => {
    closeDb();
    _resetDb();
  });

  test("first sync with no messages found", async () => {
    const result = await syncEmails(makeFakeClient());
    expect(result.messagesFound).toBe(0);
    expect(result.newEmailsStored).toBe(0);
    expect(getLastSyncTimestamp()).not.toBeNull();
  });

  test("first sync uses default 12 month lookback", async () => {
    await syncEmails(makeFakeClient());
    const callArgs = mockListMessageIds.mock.calls[0];
    const afterDate = callArgs[1] as Date;
    // Should be roughly 12 months ago
    const now = new Date();
    const expected = new Date();
    expected.setMonth(expected.getMonth() - 12);
    expect(afterDate.getFullYear()).toBe(expected.getFullYear());
    expect(afterDate.getMonth()).toBe(expected.getMonth());
  });

  test("first sync respects --since option", async () => {
    const since = new Date("2024-01-01");
    await syncEmails(makeFakeClient(), { since });
    const callArgs = mockListMessageIds.mock.calls[0];
    expect(callArgs[1]).toEqual(since);
  });

  test("stores fetched emails and updates sync state", async () => {
    const emails: RawEmail[] = [
      {
        messageId: "msg-1",
        from: "alerts@hdfcbank.net",
        subject: "Transaction",
        date: new Date("2025-06-01"),
        bodyText: "Spent Rs.100",
      },
      {
        messageId: "msg-2",
        from: "alerts@icicibank.com",
        subject: "Debit",
        date: new Date("2025-06-02"),
        bodyText: "Spent Rs.200",
      },
    ];
    mockListMessageIds.mockResolvedValue(["msg-1", "msg-2"]);
    mockFetchMessages.mockResolvedValue(emails);

    const result = await syncEmails(makeFakeClient());
    expect(result.messagesFound).toBe(2);
    expect(result.newEmailsStored).toBe(2);
    expect(getTotalSyncedCount()).toBe(2);
    expect(getAllRawEmails()).toHaveLength(2);
  });

  test("subsequent sync uses last sync timestamp", async () => {
    // First sync
    mockListMessageIds.mockResolvedValue([]);
    await syncEmails(makeFakeClient());
    const firstSyncTime = getLastSyncTimestamp()!;

    // Second sync should use the first sync's timestamp
    mockListMessageIds.mockResolvedValue([]);
    await syncEmails(makeFakeClient());
    const callArgs = mockListMessageIds.mock.calls[1];
    expect(callArgs[1]).toEqual(firstSyncTime);
  });

  test("deduplicates emails across syncs", async () => {
    const email: RawEmail = {
      messageId: "msg-1",
      from: "alerts@hdfcbank.net",
      subject: "Transaction",
      date: new Date("2025-06-01"),
      bodyText: "Spent Rs.100",
    };
    mockListMessageIds.mockResolvedValue(["msg-1"]);
    mockFetchMessages.mockResolvedValue([email]);

    await syncEmails(makeFakeClient());
    const result = await syncEmails(makeFakeClient());
    // Second sync finds same message but insertRawEmails deduplicates
    expect(result.newEmailsStored).toBe(0);
    expect(getTotalSyncedCount()).toBe(1); // only 1 total, not 2
  });
});
