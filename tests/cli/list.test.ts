import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { parseListArgs, formatTransaction, listCommand, type ListDeps } from "../../src/cli/commands/list";
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
    source: "regex",
    needsReview: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("parseListArgs", () => {
  it("parses all flags", () => {
    const opts = parseListArgs([
      "--from=2024-01-01",
      "--to=2024-12-31",
      "--type=upi",
      "--category=Food",
      "--direction=debit",
      "--bank=HDFC",
      "--limit=10",
      "--offset=5",
      "--review",
    ]);
    expect(opts.startDate).toBe("2024-01-01");
    expect(opts.endDate).toBe("2024-12-31");
    expect(opts.type).toBe("upi");
    expect(opts.category).toBe("Food");
    expect(opts.direction).toBe("debit");
    expect(opts.bank).toBe("HDFC");
    expect(opts.limit).toBe(10);
    expect(opts.offset).toBe(5);
    expect(opts.needsReview).toBe(true);
  });

  it("returns empty opts for no args", () => {
    const opts = parseListArgs([]);
    expect(opts).toEqual({});
  });
});

describe("formatTransaction", () => {
  it("formats a debit transaction", () => {
    const line = formatTransaction(makeTx());
    expect(line).toContain("2024-06-15");
    expect(line).toContain("-₹");
    expect(line).toContain("Swiggy");
    expect(line).toContain("upi");
    expect(line).toContain("HDFC");
  });

  it("formats a credit transaction", () => {
    const line = formatTransaction(makeTx({ direction: "credit" }));
    expect(line).toContain("+₹");
  });

  it("shows [review] for needs_review", () => {
    const line = formatTransaction(makeTx({ needsReview: true }));
    expect(line).toContain("[review]");
  });

  it("shows Uncategorized when no category", () => {
    const line = formatTransaction(makeTx({ category: undefined }));
    expect(line).toContain("Uncategorized");
  });
});

describe("listCommand", () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    (console.log as ReturnType<typeof spyOn>).mockRestore();
  });

  it("prints no transactions message when empty", async () => {
    const deps: ListDeps = {
      listTransactions: () => [],
      countTransactions: () => 0,
    };
    await listCommand([], deps);
    expect(logs.some((l) => l.includes("No transactions found"))).toBe(true);
  });

  it("lists transactions with header", async () => {
    const txs = [makeTx(), makeTx({ id: "tx-2", merchant: "Zomato", amount: 500 })];
    const deps: ListDeps = {
      listTransactions: () => txs,
      countTransactions: () => 2,
    };
    await listCommand([], deps);
    expect(logs.some((l) => l.includes("Date"))).toBe(true);
    expect(logs.some((l) => l.includes("Swiggy"))).toBe(true);
    expect(logs.some((l) => l.includes("Zomato"))).toBe(true);
    expect(logs.some((l) => l.includes("2 transaction(s)"))).toBe(true);
  });

  it("passes filters to listTransactions", async () => {
    let capturedOpts: Record<string, unknown> = {};
    const deps: ListDeps = {
      listTransactions: (opts) => {
        capturedOpts = opts as Record<string, unknown>;
        return [];
      },
      countTransactions: () => 0,
    };
    await listCommand(["--from=2024-01-01", "--type=upi", "--category=Food"], deps);
    expect(capturedOpts.startDate).toBe("2024-01-01");
    expect(capturedOpts.type).toBe("upi");
    expect(capturedOpts.category).toBe("Food");
  });

  it("filters by bank in-memory", async () => {
    const txs = [
      makeTx({ bank: "HDFC" }),
      makeTx({ id: "tx-2", bank: "ICICI", merchant: "Amazon" }),
    ];
    const deps: ListDeps = {
      listTransactions: () => txs,
      countTransactions: () => 2,
    };
    await listCommand(["--bank=ICICI"], deps);
    expect(logs.some((l) => l.includes("Amazon"))).toBe(true);
    expect(logs.some((l) => l.includes("Swiggy"))).toBe(false);
    expect(logs.some((l) => l.includes("1 transaction(s)"))).toBe(true);
  });
});
