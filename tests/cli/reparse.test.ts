import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { reparseCommand, type ReparseDeps } from "../../src/cli/commands/reparse";
import { _resetDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import type { RawEmail, Transaction } from "../../src/types";
import type { ParserRegistry } from "../../src/parser/registry";
import type { ClaudeCli } from "../../src/categorizer/claude-cli";

function makeRawEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: "msg-1",
    from: "bank@example.com",
    subject: "Transaction Alert",
    date: new Date("2024-01-15"),
    bodyText: "You spent Rs. 500 at Amazon",
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    emailMessageId: "msg-1",
    date: new Date("2024-01-15"),
    amount: 500,
    currency: "INR",
    direction: "debit",
    type: "upi",
    merchant: "Amazon",
    account: "XX1234",
    bank: "HDFC",
    source: "regex",
    needsReview: false,
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<ReparseDeps> = {}): ReparseDeps {
  return {
    getAllRawEmails: () => [],
    deleteAllTransactions: () => 0,
    createParserPipeline: () => ({ parse: () => [] }) as unknown as ParserRegistry,
    parseEmails: () => [],
    createClaudeCli: () => ({ isAvailable: () => false, run: async () => ({ text: "" }), runJson: async () => ({}) }) as unknown as ClaudeCli,
    categorizeTransactions: () => [],
    insertTransactions: () => 0,
    getReviewQueueCount: () => 0,
    ...overrides,
  };
}

let logs: string[] = [];
let errors: string[] = [];
const origLog = console.log;
const origError = console.error;

beforeEach(() => {
  _resetDb();
  runMigrations();
  logs = [];
  errors = [];
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  console.error = (...args: unknown[]) => errors.push(args.join(" "));
});

afterEach(() => {
  console.log = origLog;
  console.error = origError;
  _resetDb();
});

describe("reparse command", () => {
  it("reports no emails when database is empty", async () => {
    const deps = createMockDeps();
    await reparseCommand([], deps);
    expect(logs.some((l) => l.includes("No raw emails"))).toBe(true);
  });

  it("deletes existing transactions and re-parses", async () => {
    const email = makeRawEmail();
    const tx = makeTransaction();
    let deleteCalled = false;

    const deps = createMockDeps({
      getAllRawEmails: () => [email],
      deleteAllTransactions: () => { deleteCalled = true; return 5; },
      parseEmails: () => [tx],
      insertTransactions: () => 1,
    });

    await reparseCommand([], deps);
    expect(deleteCalled).toBe(true);
    expect(logs.some((l) => l.includes("Deleted 5"))).toBe(true);
    expect(logs.some((l) => l.includes("Parsed 1"))).toBe(true);
    expect(logs.some((l) => l.includes("Stored 1"))).toBe(true);
    expect(logs.some((l) => l.includes("Reparse complete"))).toBe(true);
  });

  it("skips categorization with --skip-categorize flag", async () => {
    const email = makeRawEmail();
    const tx = makeTransaction();
    let categorizeCalled = false;

    const deps = createMockDeps({
      getAllRawEmails: () => [email],
      parseEmails: () => [tx],
      insertTransactions: () => 1,
      categorizeTransactions: () => { categorizeCalled = true; return []; },
    });

    await reparseCommand(["--skip-categorize"], deps);
    expect(categorizeCalled).toBe(false);
  });

  it("categorizes uncategorized transactions when Claude is available", async () => {
    const email = makeRawEmail();
    const tx = makeTransaction({ category: undefined });
    let categorizeCalled = false;

    const deps = createMockDeps({
      getAllRawEmails: () => [email],
      parseEmails: () => [tx],
      insertTransactions: () => 1,
      createClaudeCli: () => ({ isAvailable: () => true }) as unknown as ClaudeCli,
      categorizeTransactions: () => {
        categorizeCalled = true;
        return [{ category: "Shopping", confidence: 0.9 }];
      },
    });

    await reparseCommand([], deps);
    expect(categorizeCalled).toBe(true);
    expect(tx.category).toBe("Shopping");
  });

  it("skips categorization when Claude is not available", async () => {
    const email = makeRawEmail();
    const tx = makeTransaction({ category: undefined });

    const deps = createMockDeps({
      getAllRawEmails: () => [email],
      parseEmails: () => [tx],
      insertTransactions: () => 1,
      createClaudeCli: () => ({ isAvailable: () => false }) as unknown as ClaudeCli,
    });

    await reparseCommand([], deps);
    expect(logs.some((l) => l.includes("not available"))).toBe(true);
  });

  it("reports no transactions when parsing yields nothing", async () => {
    const email = makeRawEmail();

    const deps = createMockDeps({
      getAllRawEmails: () => [email],
      parseEmails: () => [],
    });

    await reparseCommand([], deps);
    expect(logs.some((l) => l.includes("No transactions found"))).toBe(true);
  });

  it("shows review count when there are flagged transactions", async () => {
    const email = makeRawEmail();
    const tx = makeTransaction();

    const deps = createMockDeps({
      getAllRawEmails: () => [email],
      parseEmails: () => [tx],
      insertTransactions: () => 1,
      getReviewQueueCount: () => 3,
    });

    await reparseCommand([], deps);
    expect(logs.some((l) => l.includes("3 transactions need review"))).toBe(true);
  });

  it("does not categorize already-categorized transactions", async () => {
    const email = makeRawEmail();
    const tx = makeTransaction({ category: "Food" });
    let categorizeInput: Transaction[] = [];

    const deps = createMockDeps({
      getAllRawEmails: () => [email],
      parseEmails: () => [tx],
      insertTransactions: () => 1,
      createClaudeCli: () => ({ isAvailable: () => true }) as unknown as ClaudeCli,
      categorizeTransactions: (cli, txs) => {
        categorizeInput = txs as Transaction[];
        return txs.map(() => ({ category: "Other", confidence: 0.5 }));
      },
    });

    await reparseCommand([], deps);
    expect(categorizeInput.length).toBe(0);
  });
});
