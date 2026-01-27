import { describe, it, expect, beforeEach } from "bun:test";
import { syncCommand, type SyncDeps } from "../../src/cli/commands/sync";
import { ParserRegistry } from "../../src/parser/registry";
import type { RawEmail, Transaction } from "../../src/types";

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    emailMessageId: "msg-1",
    date: new Date("2025-01-15"),
    amount: 500,
    currency: "INR",
    direction: "debit",
    type: "upi",
    merchant: "Swiggy",
    account: "1234",
    bank: "HDFC",
    source: "regex",
    needsReview: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRawEmail(): RawEmail {
  return {
    messageId: "msg-1",
    from: "alerts@hdfcbank.net",
    subject: "UPI Transaction",
    date: new Date("2025-01-15"),
    bodyText: "You have done a UPI txn of Rs 500 to Swiggy",
  };
}

function makeDeps(overrides: Partial<SyncDeps> = {}): SyncDeps {
  return {
    hasCredentials: () => true,
    authenticate: async () => ({} as any),
    syncEmails: async () => ({
      messagesFound: 0,
      newEmailsStored: 0,
      syncTimestamp: new Date(),
    }),
    getAllRawEmails: () => [],
    createParserPipeline: () => new ParserRegistry(),
    parseEmails: () => [],
    createClaudeCli: () => ({
      isAvailable: () => false,
      run: () => ({ success: false, output: "" }),
      runJson: () => null,
    }) as any,
    categorizeTransactions: () => [],
    insertTransactions: () => 0,
    getReviewQueueCount: () => 0,
    generateAlerts: () => [],
    printAlerts: () => {},
    findAndFlagDuplicates: () => ({ candidatesFound: 0, duplicatesConfirmed: 0 }),
    ...overrides,
  };
}

describe("syncCommand", () => {
  beforeEach(() => {
    process.exitCode = 0;
  });

  it("should fail if credentials are missing", async () => {
    await syncCommand([], makeDeps({ hasCredentials: () => false }));
    expect(process.exitCode).toBe(1);
  });

  it("should fail if authentication fails", async () => {
    await syncCommand(
      [],
      makeDeps({
        authenticate: async () => {
          throw new Error("auth failed");
        },
      }),
    );
    expect(process.exitCode).toBe(1);
  });

  it("should fail on invalid --since date", async () => {
    await syncCommand(["--since=not-a-date"], makeDeps());
    expect(process.exitCode).toBe(1);
  });

  it("should handle no new emails gracefully", async () => {
    await syncCommand([], makeDeps());
    expect(process.exitCode).toBe(0);
  });

  it("should parse and store transactions on new emails", async () => {
    const tx = makeTx();
    let insertedTxs: Transaction[] = [];

    await syncCommand(
      [],
      makeDeps({
        syncEmails: async () => ({
          messagesFound: 5,
          newEmailsStored: 3,
          syncTimestamp: new Date(),
        }),
        getAllRawEmails: () => [makeRawEmail()],
        parseEmails: () => [tx],
        createClaudeCli: () => ({
          isAvailable: () => true,
          run: () => ({ success: true, output: "" }),
          runJson: () => null,
        }) as any,
        categorizeTransactions: () => [{ category: "Food" as const, confidence: 0.95 }],
        insertTransactions: (txs) => {
          insertedTxs = txs;
          return txs.length;
        },
      }),
    );

    expect(insertedTxs.length).toBe(1);
    expect(insertedTxs[0].category).toBe("Food");
    expect(process.exitCode).toBe(0);
  });

  it("should skip categorization with --skip-categorize flag", async () => {
    let categorizeCalled = false;

    await syncCommand(
      ["--skip-categorize"],
      makeDeps({
        syncEmails: async () => ({
          messagesFound: 1,
          newEmailsStored: 1,
          syncTimestamp: new Date(),
        }),
        getAllRawEmails: () => [makeRawEmail()],
        parseEmails: () => [makeTx()],
        categorizeTransactions: () => {
          categorizeCalled = true;
          return [];
        },
        insertTransactions: () => 1,
      }),
    );

    expect(categorizeCalled).toBe(false);
    expect(process.exitCode).toBe(0);
  });

  it("should show review queue count when there are items to review", async () => {
    await syncCommand(
      [],
      makeDeps({
        syncEmails: async () => ({
          messagesFound: 1,
          newEmailsStored: 1,
          syncTimestamp: new Date(),
        }),
        getAllRawEmails: () => [makeRawEmail()],
        parseEmails: () => [makeTx()],
        insertTransactions: () => 1,
        getReviewQueueCount: () => 3,
      }),
    );
    expect(process.exitCode).toBe(0);
  });

  it("should pass --since date to syncEmails", async () => {
    let receivedSince: Date | undefined;

    await syncCommand(
      ["--since=2024-06-01"],
      makeDeps({
        syncEmails: async (_client, opts) => {
          receivedSince = opts?.since;
          return { messagesFound: 0, newEmailsStored: 0, syncTimestamp: new Date() };
        },
      }),
    );

    expect(receivedSince).toEqual(new Date("2024-06-01"));
  });

  it("should handle sync failure", async () => {
    await syncCommand(
      [],
      makeDeps({
        syncEmails: async () => {
          throw new Error("network error");
        },
      }),
    );
    expect(process.exitCode).toBe(1);
  });
});
