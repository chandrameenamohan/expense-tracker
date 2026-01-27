import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Database } from "bun:sqlite";
import { _setDb, _resetDb, closeDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import { insertRawEmail } from "../../src/db/raw-emails";
import { insertTransaction, getTransaction } from "../../src/db/transactions";
import { recategorizeCommand } from "../../src/cli/commands/recategorize";
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
    category: "Shopping",
    ...overrides,
  };
}

describe("recategorize command", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    const db = new Database(":memory:");
    _setDb(db);
    runMigrations();
    insertRawEmail(makeEmail());
    insertTransaction(makeTx());
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined as unknown as number;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    closeDb();
    _resetDb();
    process.exitCode = undefined as unknown as number;
  });

  test("updates category successfully", () => {
    recategorizeCommand(["tx-001", "Food"]);

    const updated = getTransaction("tx-001");
    expect(updated?.category).toBe("Food");
    expect(logSpy).toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  test("shows old and new category", () => {
    recategorizeCommand(["tx-001", "Food"]);

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("Shopping");
    expect(output).toContain("Food");
  });

  test("rejects missing arguments", () => {
    recategorizeCommand([]);
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  test("rejects missing category argument", () => {
    recategorizeCommand(["tx-001"]);
    expect(process.exitCode).toBe(1);
  });

  test("rejects invalid category", () => {
    recategorizeCommand(["tx-001", "InvalidCat"]);
    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("Invalid category");
  });

  test("rejects non-existent transaction", () => {
    recategorizeCommand(["tx-999", "Food"]);
    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("not found");
  });

  test("handles transaction with no previous category", () => {
    insertRawEmail(makeEmail("msg-002"));
    insertTransaction(makeTx({ id: "tx-002", emailMessageId: "msg-002", category: undefined }));

    recategorizeCommand(["tx-002", "Bills"]);

    const updated = getTransaction("tx-002");
    expect(updated?.category).toBe("Bills");
    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("(none)");
  });
});
