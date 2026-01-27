import { describe, expect, test, beforeEach } from "bun:test";
import {
  buildCategoryPrompt,
  buildBatchCategoryPrompt,
  isValidCategory,
  categorizeTransaction,
  categorizeTransactions,
  CATEGORIES,
} from "../../src/categorizer/categorize";
import { createClaudeCli } from "../../src/categorizer/claude-cli";
import { _resetDb, runMigrations } from "../../src/db";
import type { Transaction } from "../../src/types";

beforeEach(() => {
  _resetDb();
  process.env.EXPENSE_TRACKER_DB = ":memory:";
  runMigrations();
});

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    emailMessageId: "msg-1",
    date: new Date("2024-01-15"),
    amount: 500,
    currency: "INR",
    direction: "debit",
    type: "upi",
    merchant: "Swiggy",
    account: "XXXX1234",
    bank: "HDFC",
    source: "regex",
    needsReview: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockCli(response: unknown) {
  const json = JSON.stringify(response);
  return createClaudeCli(() => ({
    exitCode: 0,
    stdout: JSON.stringify({ result: json }),
    stderr: "",
  }));
}

function failingCli() {
  return createClaudeCli(() => ({
    exitCode: 1,
    stdout: "",
    stderr: "error",
  }));
}

describe("isValidCategory", () => {
  test("accepts all valid categories", () => {
    for (const cat of CATEGORIES) {
      expect(isValidCategory(cat)).toBe(true);
    }
  });

  test("rejects invalid categories", () => {
    expect(isValidCategory("Groceries")).toBe(false);
    expect(isValidCategory("")).toBe(false);
    expect(isValidCategory("food")).toBe(false); // case-sensitive
  });
});

describe("buildCategoryPrompt", () => {
  test("includes merchant, amount, type, direction", () => {
    const prompt = buildCategoryPrompt(makeTx());
    expect(prompt).toContain("Swiggy");
    expect(prompt).toContain("INR 500");
    expect(prompt).toContain("upi");
    expect(prompt).toContain("debit");
  });

  test("includes description when present", () => {
    const prompt = buildCategoryPrompt(makeTx({ description: "dinner order" }));
    expect(prompt).toContain("dinner order");
  });

  test("omits description when absent", () => {
    const prompt = buildCategoryPrompt(makeTx());
    expect(prompt).not.toContain("Description:");
  });

  test("lists all categories", () => {
    const prompt = buildCategoryPrompt(makeTx());
    for (const cat of CATEGORIES) {
      expect(prompt).toContain(cat);
    }
  });
});

describe("buildBatchCategoryPrompt", () => {
  test("includes all transactions numbered", () => {
    const txs = [
      makeTx({ merchant: "Swiggy" }),
      makeTx({ id: "tx-2", merchant: "Uber" }),
    ];
    const prompt = buildBatchCategoryPrompt(txs);
    expect(prompt).toContain("1. Merchant: Swiggy");
    expect(prompt).toContain("2. Merchant: Uber");
  });
});

describe("categorizeTransaction", () => {
  test("returns category from Claude response", () => {
    const cli = mockCli({ category: "Food", confidence: 0.95 });
    const result = categorizeTransaction(cli, makeTx());
    expect(result.category).toBe("Food");
    expect(result.confidence).toBe(0.95);
  });

  test("clamps confidence to [0, 1]", () => {
    const cli = mockCli({ category: "Food", confidence: 1.5 });
    const result = categorizeTransaction(cli, makeTx());
    expect(result.confidence).toBe(1);
  });

  test("defaults confidence to 0.5 when missing", () => {
    const cli = mockCli({ category: "Transport" });
    const result = categorizeTransaction(cli, makeTx());
    expect(result.category).toBe("Transport");
    expect(result.confidence).toBe(0.5);
  });

  test("returns Other when Claude fails", () => {
    const cli = failingCli();
    const result = categorizeTransaction(cli, makeTx());
    expect(result.category).toBe("Other");
    expect(result.confidence).toBe(0);
  });

  test("returns Other when category is invalid", () => {
    const cli = mockCli({ category: "Groceries", confidence: 0.9 });
    const result = categorizeTransaction(cli, makeTx());
    expect(result.category).toBe("Other");
    expect(result.confidence).toBe(0);
  });
});

describe("categorizeTransactions", () => {
  test("returns empty array for empty input", () => {
    const cli = mockCli([]);
    const results = categorizeTransactions(cli, []);
    expect(results).toEqual([]);
  });

  test("delegates single transaction to categorizeTransaction", () => {
    const cli = mockCli({ category: "Shopping", confidence: 0.8 });
    const results = categorizeTransactions(cli, [makeTx()]);
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Shopping");
  });

  test("handles batch response", () => {
    const cli = mockCli([
      { category: "Food", confidence: 0.9 },
      { category: "Transport", confidence: 0.85 },
    ]);
    const txs = [makeTx(), makeTx({ id: "tx-2", merchant: "Uber" })];
    const results = categorizeTransactions(cli, txs);
    expect(results).toHaveLength(2);
    expect(results[0].category).toBe("Food");
    expect(results[1].category).toBe("Transport");
  });

  test("falls back to individual calls on length mismatch", () => {
    // Batch returns wrong length, so it falls back to individual calls
    // Each individual call gets the same mock response
    let callCount = 0;
    const cli = createClaudeCli(() => {
      callCount++;
      // First call (batch) returns mismatched array
      // Subsequent calls (individual) return single objects
      const response =
        callCount === 1
          ? [{ category: "Food", confidence: 0.9 }] // wrong length for 2 txs
          : { category: "Bills", confidence: 0.7 };
      return {
        exitCode: 0,
        stdout: JSON.stringify({ result: JSON.stringify(response) }),
        stderr: "",
      };
    });

    const txs = [makeTx(), makeTx({ id: "tx-2", merchant: "Uber" })];
    const results = categorizeTransactions(cli, txs);
    expect(results).toHaveLength(2);
    expect(results[0].category).toBe("Bills");
    expect(results[1].category).toBe("Bills");
  });

  test("handles invalid categories in batch", () => {
    const cli = mockCli([
      { category: "Food", confidence: 0.9 },
      { category: "InvalidCat", confidence: 0.8 },
    ]);
    const txs = [makeTx(), makeTx({ id: "tx-2" })];
    const results = categorizeTransactions(cli, txs);
    expect(results[0].category).toBe("Food");
    expect(results[1].category).toBe("Other");
    expect(results[1].confidence).toBe(0);
  });
});
