import { describe, expect, test, beforeEach } from "bun:test";
import {
  buildCategoryPrompt,
  buildBatchCategoryPrompt,
  formatCorrections,
  gatherCorrections,
  categorizeTransaction,
  categorizeTransactions,
} from "../../src/categorizer/categorize";
import { createClaudeCli } from "../../src/categorizer/claude-cli";
import { _resetDb, runMigrations } from "../../src/db";
import { insertCategoryCorrection } from "../../src/db/category-corrections";
import type { CategoryCorrection, Transaction } from "../../src/types";

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

function makeCorrection(overrides: Partial<CategoryCorrection> = {}): CategoryCorrection {
  return {
    id: 1,
    merchant: "Swiggy",
    originalCategory: "Other",
    correctedCategory: "Food",
    createdAt: new Date(),
    ...overrides,
  };
}

describe("formatCorrections", () => {
  test("returns empty string for no corrections", () => {
    expect(formatCorrections([])).toBe("");
  });

  test("formats corrections as few-shot examples", () => {
    const corrections = [
      makeCorrection({ merchant: "Swiggy", originalCategory: "Other", correctedCategory: "Food" }),
      makeCorrection({ id: 2, merchant: "Uber", originalCategory: "Other", correctedCategory: "Transport" }),
    ];
    const result = formatCorrections(corrections);
    expect(result).toContain("user has previously corrected");
    expect(result).toContain('"Swiggy": was "Other" → corrected to "Food"');
    expect(result).toContain('"Uber": was "Other" → corrected to "Transport"');
  });
});

describe("buildCategoryPrompt with corrections", () => {
  test("includes corrections block when provided", () => {
    const corrections = [
      makeCorrection({ merchant: "Swiggy", correctedCategory: "Food" }),
    ];
    const prompt = buildCategoryPrompt(makeTx(), corrections);
    expect(prompt).toContain("user has previously corrected");
    expect(prompt).toContain('"Swiggy"');
    expect(prompt).toContain("Food");
  });

  test("omits corrections block when empty", () => {
    const prompt = buildCategoryPrompt(makeTx(), []);
    expect(prompt).not.toContain("previously corrected");
  });
});

describe("buildBatchCategoryPrompt with corrections", () => {
  test("includes corrections block when provided", () => {
    const corrections = [
      makeCorrection({ merchant: "Uber", correctedCategory: "Transport" }),
    ];
    const txs = [makeTx(), makeTx({ id: "tx-2", merchant: "Uber" })];
    const prompt = buildBatchCategoryPrompt(txs, corrections);
    expect(prompt).toContain("previously corrected");
    expect(prompt).toContain("Transport");
  });
});

describe("gatherCorrections (with DB)", () => {
  beforeEach(() => {
    _resetDb();
    process.env.EXPENSE_TRACKER_DB = ":memory:";
    runMigrations();
  });

  test("returns merchant-specific corrections first", () => {
    insertCategoryCorrection("Swiggy", "Other", "Food");
    insertCategoryCorrection("Uber", "Other", "Transport");
    const result = gatherCorrections("Swiggy", 10);
    expect(result[0].merchant).toBe("Swiggy");
  });

  test("fills remaining slots with recent corrections", () => {
    insertCategoryCorrection("Swiggy", "Other", "Food");
    insertCategoryCorrection("Uber", "Other", "Transport");
    insertCategoryCorrection("Amazon", "Other", "Shopping");
    const result = gatherCorrections("Swiggy", 3);
    expect(result).toHaveLength(3);
    expect(result[0].merchant).toBe("Swiggy");
    // Other two are recent non-Swiggy corrections
    const others = result.slice(1).map((c) => c.merchant);
    expect(others).toContain("Uber");
    expect(others).toContain("Amazon");
  });

  test("returns empty array when no corrections exist", () => {
    const result = gatherCorrections("Swiggy");
    expect(result).toHaveLength(0);
  });

  test("deduplicates merchant corrections from recent", () => {
    insertCategoryCorrection("Swiggy", "Other", "Food");
    const result = gatherCorrections("Swiggy", 10);
    // Swiggy should appear only once even though it's in both merchant + recent
    const swiggyCount = result.filter((c) => c.merchant === "Swiggy").length;
    expect(swiggyCount).toBe(1);
  });
});

describe("categorizeTransaction with feedback loop", () => {
  beforeEach(() => {
    _resetDb();
    process.env.EXPENSE_TRACKER_DB = ":memory:";
    runMigrations();
  });

  test("prompt includes corrections when they exist", () => {
    insertCategoryCorrection("Swiggy", "Other", "Food");

    let capturedPrompt = "";
    const cli = createClaudeCli((args) => {
      // The prompt is passed as the last argument after -p
      const argsArray = args as string[];
      const pIdx = argsArray.indexOf("-p");
      if (pIdx >= 0) capturedPrompt = argsArray[pIdx + 1];
      return {
        exitCode: 0,
        stdout: JSON.stringify({ result: JSON.stringify({ category: "Food", confidence: 0.9 }) }),
        stderr: "",
      };
    });

    categorizeTransaction(cli, makeTx());
    expect(capturedPrompt).toContain("previously corrected");
    expect(capturedPrompt).toContain("Swiggy");
  });

  test("works without corrections", () => {
    const cli = mockCli({ category: "Food", confidence: 0.95 });
    const result = categorizeTransaction(cli, makeTx());
    expect(result.category).toBe("Food");
  });
});
