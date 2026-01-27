import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { reviewCommand, formatForReview, type ReviewDeps } from "../../src/cli/commands/review";
import type { Transaction } from "../../src/types";

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    emailMessageId: "msg-1",
    date: new Date("2024-06-15T10:00:00Z"),
    amount: 1500,
    currency: "INR",
    direction: "debit",
    type: "upi",
    merchant: "Swiggy",
    account: "1234",
    bank: "HDFC",
    source: "ai",
    confidence: 0.5,
    needsReview: true,
    category: "Food",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockDeps(
  queue: Transaction[],
  inputs: string[],
): { deps: ReviewDeps; calls: Record<string, unknown[][]> } {
  let inputIdx = 0;
  const calls: Record<string, unknown[][]> = {
    resolveReview: [],
    updateTransactionCategory: [],
    insertCategoryCorrection: [],
  };

  return {
    deps: {
      getReviewQueue: () => queue,
      getReviewQueueCount: () => queue.length,
      resolveReview: (id: string) => {
        calls.resolveReview.push([id]);
        return true;
      },
      updateTransactionCategory: (id: string, cat: string) => {
        calls.updateTransactionCategory.push([id, cat]);
        return true;
      },
      insertCategoryCorrection: (merchant: string, orig: string, corrected: string, desc?: string) => {
        calls.insertCategoryCorrection.push([merchant, orig, corrected, desc]);
      },
      readLine: async () => inputs[inputIdx++] ?? "q",
    },
    calls,
  };
}

describe("formatForReview", () => {
  it("formats transaction details", () => {
    const tx = makeTx();
    const output = formatForReview(tx);
    expect(output).toContain("tx-1");
    expect(output).toContain("2024-06-15");
    expect(output).toContain("Swiggy");
    expect(output).toContain("Food");
    expect(output).toContain("50%");
    expect(output).toContain("HDFC");
  });

  it("shows description when present", () => {
    const tx = makeTx({ description: "Pizza order" });
    const output = formatForReview(tx);
    expect(output).toContain("Pizza order");
  });
});

describe("reviewCommand", () => {
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  it("prints message when no transactions need review", async () => {
    const { deps } = createMockDeps([], []);
    await reviewCommand([], deps);
    expect(logSpy).toHaveBeenCalledWith("No transactions need review.");
  });

  it("approves a transaction", async () => {
    const tx = makeTx();
    const { deps, calls } = createMockDeps([tx], ["a"]);
    await reviewCommand([], deps);
    expect(calls.resolveReview).toEqual([["tx-1"]]);
  });

  it("recategorizes a transaction", async () => {
    const tx = makeTx({ category: "Food" });
    const { deps, calls } = createMockDeps([tx], ["c Shopping"]);
    await reviewCommand([], deps);
    expect(calls.updateTransactionCategory).toEqual([["tx-1", "Shopping"]]);
    expect(calls.resolveReview).toEqual([["tx-1"]]);
    expect(calls.insertCategoryCorrection).toEqual([["Swiggy", "Food", "Shopping", undefined]]);
  });

  it("rejects invalid category and retries", async () => {
    const tx = makeTx();
    const { deps, calls } = createMockDeps([tx], ["c InvalidCat", "a"]);
    await reviewCommand([], deps);
    expect(calls.resolveReview).toEqual([["tx-1"]]);
  });

  it("skips a transaction", async () => {
    const tx = makeTx();
    const { deps, calls } = createMockDeps([tx], ["s"]);
    await reviewCommand([], deps);
    expect(calls.resolveReview).toEqual([]);
  });

  it("quits early", async () => {
    const txs = [makeTx({ id: "tx-1" }), makeTx({ id: "tx-2" })];
    const { deps, calls } = createMockDeps(txs, ["a", "q"]);
    await reviewCommand([], deps);
    expect(calls.resolveReview).toEqual([["tx-1"]]);
  });

  it("handles unknown action gracefully", async () => {
    const tx = makeTx();
    const { deps } = createMockDeps([tx], ["xyz", "a"]);
    await reviewCommand([], deps);
    // Should show error message then accept approve
  });

  it("shows summary after completing all reviews", async () => {
    const txs = [makeTx({ id: "tx-1" }), makeTx({ id: "tx-2" })];
    const { deps } = createMockDeps(txs, ["a", "s"]);
    await reviewCommand([], deps);
    expect(logSpy).toHaveBeenCalledWith("\nDone. Reviewed: 1, Skipped: 1");
  });
});
