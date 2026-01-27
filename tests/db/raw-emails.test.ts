import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { _setDb, _resetDb, closeDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import {
  insertRawEmail,
  insertRawEmails,
  getRawEmail,
  getAllRawEmails,
  rawEmailExists,
} from "../../src/db/raw-emails";
import type { RawEmail } from "../../src/types";

function makeEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: "msg-001",
    from: "alerts@hdfcbank.net",
    subject: "Transaction Alert",
    date: new Date("2025-01-15T10:30:00Z"),
    bodyText: "You have spent Rs.500 at Amazon",
    bodyHtml: "<p>You have spent Rs.500 at Amazon</p>",
    ...overrides,
  };
}

describe("raw email storage", () => {
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

  test("insertRawEmail stores and retrieves an email", () => {
    const email = makeEmail();
    insertRawEmail(email);

    const result = getRawEmail("msg-001");
    expect(result).not.toBeNull();
    expect(result!.messageId).toBe("msg-001");
    expect(result!.from).toBe("alerts@hdfcbank.net");
    expect(result!.subject).toBe("Transaction Alert");
    expect(result!.bodyText).toBe("You have spent Rs.500 at Amazon");
    expect(result!.bodyHtml).toBe("<p>You have spent Rs.500 at Amazon</p>");
    expect(result!.date).toEqual(new Date("2025-01-15T10:30:00Z"));
    expect(result!.fetchedAt).toBeInstanceOf(Date);
  });

  test("insertRawEmail ignores duplicate message_id", () => {
    const email = makeEmail();
    insertRawEmail(email);
    insertRawEmail(makeEmail({ subject: "Different Subject" }));

    const result = getRawEmail("msg-001");
    expect(result!.subject).toBe("Transaction Alert");
  });

  test("insertRawEmail handles null bodyHtml", () => {
    insertRawEmail(makeEmail({ bodyHtml: undefined }));
    const result = getRawEmail("msg-001");
    expect(result!.bodyHtml).toBeUndefined();
  });

  test("insertRawEmails batch inserts multiple emails", () => {
    const emails = [
      makeEmail({ messageId: "msg-001" }),
      makeEmail({ messageId: "msg-002", subject: "Alert 2" }),
      makeEmail({ messageId: "msg-003", subject: "Alert 3" }),
    ];
    const inserted = insertRawEmails(emails);
    expect(inserted).toBe(3);

    const all = getAllRawEmails();
    expect(all).toHaveLength(3);
  });

  test("insertRawEmails returns count excluding duplicates", () => {
    insertRawEmail(makeEmail({ messageId: "msg-001" }));
    const inserted = insertRawEmails([
      makeEmail({ messageId: "msg-001" }),
      makeEmail({ messageId: "msg-002" }),
    ]);
    expect(inserted).toBe(1);
  });

  test("getAllRawEmails returns emails ordered by date descending", () => {
    insertRawEmails([
      makeEmail({ messageId: "msg-old", date: new Date("2025-01-01") }),
      makeEmail({ messageId: "msg-new", date: new Date("2025-06-01") }),
      makeEmail({ messageId: "msg-mid", date: new Date("2025-03-01") }),
    ]);
    const all = getAllRawEmails();
    expect(all[0].messageId).toBe("msg-new");
    expect(all[1].messageId).toBe("msg-mid");
    expect(all[2].messageId).toBe("msg-old");
  });

  test("getRawEmail returns null for non-existent id", () => {
    expect(getRawEmail("nonexistent")).toBeNull();
  });

  test("rawEmailExists returns correct boolean", () => {
    expect(rawEmailExists("msg-001")).toBe(false);
    insertRawEmail(makeEmail());
    expect(rawEmailExists("msg-001")).toBe(true);
  });
});
