import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { _setDb, _resetDb, closeDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import { insertRawEmail } from "../../src/db/raw-emails";
import { insertTransaction } from "../../src/db/transactions";
import {
  getReviewQueue,
  getReviewQueueCount,
  resolveReview,
  flagForReview,
} from "../../src/db/review-queue";
import type { Transaction, RawEmail } from "../../src/types";

function makeEmail(id = "msg-001"): RawEmail {
  return {
    messageId: id,
    from: "alerts@hdfcbank.net",
    subject: "Transaction Alert",
    date: new Date("2025-01-15T10:30:00Z"),
    bodyText: "You have spent Rs.500 at Amazon",
  };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-001",
    emailMessageId: "msg-001",
    date: new Date("2025-01-15T10:30:00Z"),
    amount: 500,
    currency: "INR",
    direction: "debit",
    type: "upi",
    merchant: "Amazon",
    account: "XXXX1234",
    bank: "HDFC",
    source: "regex",
    needsReview: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("review queue", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    _setDb(db);
    runMigrations();
    insertRawEmail(makeEmail("msg-001"));
    insertRawEmail(makeEmail("msg-002"));
    insertRawEmail(makeEmail("msg-003"));
  });

  afterEach(() => {
    closeDb();
    _resetDb();
  });

  test("getReviewQueue returns only needs_review transactions", () => {
    insertTransaction(makeTx({ id: "tx-1", needsReview: true, source: "ai" }));
    insertTransaction(makeTx({ id: "tx-2", needsReview: false, source: "regex" }));
    insertTransaction(makeTx({ id: "tx-3", needsReview: true, source: "ai", emailMessageId: "msg-002", merchant: "Flipkart" }));

    const queue = getReviewQueue();
    expect(queue).toHaveLength(2);
    expect(queue.map((t) => t.id).sort()).toEqual(["tx-1", "tx-3"]);
  });

  test("getReviewQueue returns empty array when no reviews needed", () => {
    insertTransaction(makeTx({ id: "tx-1", needsReview: false }));
    expect(getReviewQueue()).toHaveLength(0);
  });

  test("getReviewQueue supports limit and offset", () => {
    insertTransaction(makeTx({ id: "tx-1", needsReview: true, source: "ai", date: new Date("2025-01-10") }));
    insertTransaction(makeTx({ id: "tx-2", needsReview: true, source: "ai", emailMessageId: "msg-002", merchant: "Flipkart", date: new Date("2025-01-12") }));
    insertTransaction(makeTx({ id: "tx-3", needsReview: true, source: "ai", emailMessageId: "msg-003", merchant: "Swiggy", date: new Date("2025-01-14") }));

    const first = getReviewQueue({ limit: 2 });
    expect(first).toHaveLength(2);
    expect(first[0].id).toBe("tx-3"); // most recent first

    const second = getReviewQueue({ limit: 2, offset: 2 });
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe("tx-1");
  });

  test("getReviewQueue filters by source", () => {
    insertTransaction(makeTx({ id: "tx-1", needsReview: true, source: "ai" }));
    insertTransaction(makeTx({ id: "tx-2", needsReview: true, source: "regex", emailMessageId: "msg-002", merchant: "Flipkart" }));

    const aiOnly = getReviewQueue({ source: "ai" });
    expect(aiOnly).toHaveLength(1);
    expect(aiOnly[0].id).toBe("tx-1");
  });

  test("getReviewQueueCount returns correct count", () => {
    expect(getReviewQueueCount()).toBe(0);

    insertTransaction(makeTx({ id: "tx-1", needsReview: true, source: "ai" }));
    insertTransaction(makeTx({ id: "tx-2", needsReview: false }));
    insertTransaction(makeTx({ id: "tx-3", needsReview: true, source: "ai", emailMessageId: "msg-002", merchant: "Flipkart" }));

    expect(getReviewQueueCount()).toBe(2);
  });

  test("resolveReview clears needs_review flag", () => {
    insertTransaction(makeTx({ id: "tx-1", needsReview: true, source: "ai" }));
    expect(getReviewQueueCount()).toBe(1);

    const result = resolveReview("tx-1");
    expect(result).toBe(true);
    expect(getReviewQueueCount()).toBe(0);
  });

  test("resolveReview returns false for non-existent id", () => {
    expect(resolveReview("nonexistent")).toBe(false);
  });

  test("flagForReview sets needs_review flag", () => {
    insertTransaction(makeTx({ id: "tx-1", needsReview: false }));
    expect(getReviewQueueCount()).toBe(0);

    const result = flagForReview("tx-1");
    expect(result).toBe(true);
    expect(getReviewQueueCount()).toBe(1);
  });
});
