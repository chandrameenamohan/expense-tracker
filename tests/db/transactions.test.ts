import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { _setDb, _resetDb, closeDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import { insertRawEmail } from "../../src/db/raw-emails";
import {
  insertTransaction,
  insertTransactions,
  getTransaction,
  getTransactionsByEmail,
  listTransactions,
  updateTransactionCategory,
  updateTransactionReview,
  deleteTransaction,
  countTransactions,
} from "../../src/db/transactions";
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

describe("transaction CRUD", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");
    _setDb(db);
    runMigrations(db);
    // Insert a raw email so foreign key is satisfied
    insertRawEmail(makeEmail());
  });

  afterEach(() => {
    closeDb();
    _resetDb();
  });

  test("insertTransaction stores and retrieves a transaction", () => {
    const tx = makeTx();
    const inserted = insertTransaction(tx);
    expect(inserted).toBe(true);

    const result = getTransaction("tx-001");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("tx-001");
    expect(result!.emailMessageId).toBe("msg-001");
    expect(result!.amount).toBe(500);
    expect(result!.currency).toBe("INR");
    expect(result!.direction).toBe("debit");
    expect(result!.type).toBe("upi");
    expect(result!.merchant).toBe("Amazon");
    expect(result!.account).toBe("XXXX1234");
    expect(result!.bank).toBe("HDFC");
    expect(result!.source).toBe("regex");
    expect(result!.needsReview).toBe(false);
    expect(result!.confidence).toBeUndefined();
  });

  test("insertTransaction ignores composite duplicates", () => {
    insertTransaction(makeTx());
    const dup = insertTransaction(
      makeTx({ id: "tx-002" }), // different id but same dedup key
    );
    expect(dup).toBe(false);
  });

  test("insertTransaction allows same email with different amount", () => {
    insertTransaction(makeTx());
    const ok = insertTransaction(
      makeTx({ id: "tx-002", amount: 1000 }),
    );
    expect(ok).toBe(true);
  });

  test("composite dedup allows same email with different merchant", () => {
    insertTransaction(makeTx());
    const ok = insertTransaction(
      makeTx({ id: "tx-002", merchant: "Flipkart" }),
    );
    expect(ok).toBe(true);
  });

  test("composite dedup allows same email with different date", () => {
    insertTransaction(makeTx());
    const ok = insertTransaction(
      makeTx({ id: "tx-002", date: new Date("2025-02-01T10:00:00Z") }),
    );
    expect(ok).toBe(true);
  });

  test("composite dedup rejects when all four key fields match", () => {
    insertTransaction(makeTx());
    // Different id, reference, bank — but same email_message_id + amount + merchant + date
    const dup = insertTransaction(
      makeTx({ id: "tx-002", reference: "REF999", bank: "ICICI" }),
    );
    expect(dup).toBe(false);
    // Only 1 row should exist
    expect(countTransactions()).toBe(1);
  });

  test("insertTransactions batch inserts", () => {
    insertRawEmail(makeEmail("msg-002"));
    const count = insertTransactions([
      makeTx({ id: "tx-001", emailMessageId: "msg-001" }),
      makeTx({ id: "tx-002", emailMessageId: "msg-002", amount: 200 }),
    ]);
    expect(count).toBe(2);
  });

  test("insertTransactions skips duplicates in batch", () => {
    insertTransaction(makeTx());
    const count = insertTransactions([
      makeTx({ id: "tx-dup" }), // same dedup key
      makeTx({ id: "tx-002", amount: 999 }),
    ]);
    expect(count).toBe(1);
  });

  test("getTransaction returns null for non-existent id", () => {
    expect(getTransaction("nonexistent")).toBeNull();
  });

  test("getTransactionsByEmail returns all transactions for an email", () => {
    insertTransaction(makeTx({ id: "tx-001", amount: 500 }));
    insertTransaction(makeTx({ id: "tx-002", amount: 200 }));
    const results = getTransactionsByEmail("msg-001");
    expect(results).toHaveLength(2);
  });

  test("listTransactions returns all ordered by date desc", () => {
    insertRawEmail(makeEmail("msg-002"));
    insertTransaction(
      makeTx({ id: "tx-old", date: new Date("2025-01-01"), amount: 100 }),
    );
    insertTransaction(
      makeTx({
        id: "tx-new",
        emailMessageId: "msg-002",
        date: new Date("2025-06-01"),
        amount: 200,
        merchant: "Flipkart",
      }),
    );
    const all = listTransactions();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe("tx-new");
    expect(all[1].id).toBe("tx-old");
  });

  test("listTransactions filters by type", () => {
    insertTransaction(makeTx({ id: "tx-1", type: "upi", amount: 100 }));
    insertTransaction(
      makeTx({ id: "tx-2", type: "credit_card", amount: 200, merchant: "B" }),
    );
    const upi = listTransactions({ type: "upi" });
    expect(upi).toHaveLength(1);
    expect(upi[0].type).toBe("upi");
  });

  test("listTransactions filters by needsReview", () => {
    insertTransaction(makeTx({ id: "tx-1", needsReview: false, amount: 100 }));
    insertTransaction(
      makeTx({
        id: "tx-2",
        needsReview: true,
        amount: 200,
        merchant: "B",
        source: "ai",
        confidence: 0.5,
      }),
    );
    const review = listTransactions({ needsReview: true });
    expect(review).toHaveLength(1);
    expect(review[0].needsReview).toBe(true);
  });

  test("listTransactions filters by date range", () => {
    insertRawEmail(makeEmail("msg-002"));
    insertTransaction(
      makeTx({ id: "tx-jan", date: new Date("2025-01-15"), amount: 100 }),
    );
    insertTransaction(
      makeTx({
        id: "tx-jun",
        emailMessageId: "msg-002",
        date: new Date("2025-06-15"),
        amount: 200,
        merchant: "B",
      }),
    );
    const filtered = listTransactions({
      startDate: "2025-03-01",
      endDate: "2025-12-31",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("tx-jun");
  });

  test("listTransactions supports limit and offset", () => {
    for (let i = 0; i < 5; i++) {
      insertTransaction(
        makeTx({
          id: `tx-${i}`,
          amount: (i + 1) * 100,
          merchant: `M${i}`,
        }),
      );
    }
    const page = listTransactions({ limit: 2, offset: 1 });
    expect(page).toHaveLength(2);
  });

  test("updateTransactionCategory updates category", () => {
    insertTransaction(makeTx());
    const ok = updateTransactionCategory("tx-001", "Food");
    expect(ok).toBe(true);

    const tx = getTransaction("tx-001");
    expect(tx!.category).toBe("Food");
  });

  test("updateTransactionCategory returns false for non-existent", () => {
    expect(updateTransactionCategory("nope", "Food")).toBe(false);
  });

  test("updateTransactionReview updates needs_review flag", () => {
    insertTransaction(makeTx({ needsReview: true, source: "ai", confidence: 0.5 }));
    const ok = updateTransactionReview("tx-001", false);
    expect(ok).toBe(true);

    const tx = getTransaction("tx-001");
    expect(tx!.needsReview).toBe(false);
  });

  test("deleteTransaction removes a transaction", () => {
    insertTransaction(makeTx());
    const ok = deleteTransaction("tx-001");
    expect(ok).toBe(true);
    expect(getTransaction("tx-001")).toBeNull();
  });

  test("deleteTransaction returns false for non-existent", () => {
    expect(deleteTransaction("nope")).toBe(false);
  });

  test("countTransactions counts all", () => {
    insertTransaction(makeTx({ id: "tx-1", amount: 100 }));
    insertTransaction(makeTx({ id: "tx-2", amount: 200, merchant: "B" }));
    expect(countTransactions()).toBe(2);
  });

  test("countTransactions filters by needsReview", () => {
    insertTransaction(makeTx({ id: "tx-1", amount: 100 }));
    insertTransaction(
      makeTx({
        id: "tx-2",
        amount: 200,
        merchant: "B",
        needsReview: true,
        source: "ai",
        confidence: 0.5,
      }),
    );
    expect(countTransactions({ needsReview: true })).toBe(1);
  });

  test("multi-transaction email: multiple distinct transactions stored under same email_message_id", () => {
    // Simulate an email containing 3 different transactions (e.g., a bank statement summary)
    const tx1 = makeTx({ id: "tx-multi-1", amount: 500, merchant: "Amazon", type: "upi" });
    const tx2 = makeTx({ id: "tx-multi-2", amount: 1200, merchant: "Flipkart", type: "upi" });
    const tx3 = makeTx({ id: "tx-multi-3", amount: 300, merchant: "Swiggy", type: "upi" });

    const count = insertTransactions([tx1, tx2, tx3]);
    expect(count).toBe(3);

    const results = getTransactionsByEmail("msg-001");
    expect(results).toHaveLength(3);
    const merchants = results.map((t) => t.merchant).sort();
    expect(merchants).toEqual(["Amazon", "Flipkart", "Swiggy"]);

    // All share the same email_message_id
    for (const t of results) {
      expect(t.emailMessageId).toBe("msg-001");
    }
  });

  test("multi-transaction email: dedup still works within same email", () => {
    // Two transactions with identical dedup keys from the same email should dedup
    insertTransaction(makeTx({ id: "tx-a", amount: 500, merchant: "Amazon" }));
    const dup = insertTransaction(makeTx({ id: "tx-b", amount: 500, merchant: "Amazon" }));
    expect(dup).toBe(false);
    expect(getTransactionsByEmail("msg-001")).toHaveLength(1);
  });

  test("multi-transaction email: mixed sources (regex + ai) from same email", () => {
    insertTransaction(makeTx({ id: "tx-regex", amount: 500, source: "regex", needsReview: false }));
    insertTransaction(
      makeTx({
        id: "tx-ai",
        amount: 800,
        merchant: "Unknown Shop",
        source: "ai",
        confidence: 0.6,
        needsReview: true,
      }),
    );
    const results = getTransactionsByEmail("msg-001");
    expect(results).toHaveLength(2);

    const regex = results.find((t) => t.source === "regex")!;
    const ai = results.find((t) => t.source === "ai")!;
    expect(regex.needsReview).toBe(false);
    expect(ai.needsReview).toBe(true);
    expect(ai.confidence).toBe(0.6);
  });

  test("countTransactions counts multi-transaction emails correctly", () => {
    insertTransactions([
      makeTx({ id: "tx-1", amount: 100, merchant: "A" }),
      makeTx({ id: "tx-2", amount: 200, merchant: "B" }),
      makeTx({ id: "tx-3", amount: 300, merchant: "C" }),
    ]);
    expect(countTransactions()).toBe(3);
  });

  test("AI transaction stores confidence and source correctly", () => {
    insertTransaction(
      makeTx({
        source: "ai",
        confidence: 0.85,
        needsReview: false,
      }),
    );
    const tx = getTransaction("tx-001");
    expect(tx!.source).toBe("ai");
    expect(tx!.confidence).toBe(0.85);
    expect(tx!.needsReview).toBe(false);
  });
});
