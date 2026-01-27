import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { getDb, closeDb, _resetDb, runMigrations } from "../../src/db";
import { parseSummaryArgs, getSummaryData, summaryCommand } from "../../src/cli/commands/summary";

function setupDb() {
  process.env.EXPENSE_TRACKER_DB = ":memory:";
  _resetDb();
  runMigrations();
}

function insertTx(overrides: Record<string, unknown> = {}) {
  const db = getDb();
  const id = overrides.id ?? crypto.randomUUID();
  const emailId = (overrides.email_message_id ?? `email-${id}`) as string;

  // Ensure raw_email exists for FK
  db.prepare(
    `INSERT OR IGNORE INTO raw_emails (message_id, from_address, subject, date, body_text)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(emailId, "bank@example.com", "Transaction", "2025-01-15", "body");

  db.prepare(
    `INSERT INTO transactions (id, email_message_id, date, amount, currency, direction, type, merchant, source, needs_review, category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    emailId,
    overrides.date ?? "2025-01-15T10:00:00Z",
    overrides.amount ?? 100,
    overrides.currency ?? "INR",
    overrides.direction ?? "debit",
    overrides.type ?? "upi",
    overrides.merchant ?? "Swiggy",
    overrides.source ?? "regex",
    overrides.needs_review ?? 0,
    overrides.category ?? "Food",
  );
}

describe("parseSummaryArgs", () => {
  test("parses --from, --to, --direction", () => {
    const opts = parseSummaryArgs(["--from=2025-01-01", "--to=2025-12-31", "--direction=debit"]);
    expect(opts.startDate).toBe("2025-01-01");
    expect(opts.endDate).toBe("2025-12-31");
    expect(opts.direction).toBe("debit");
  });

  test("returns empty options for no args", () => {
    const opts = parseSummaryArgs([]);
    expect(opts).toEqual({});
  });
});

describe("getSummaryData", () => {
  beforeEach(setupDb);
  afterEach(() => {
    closeDb();
    delete process.env.EXPENSE_TRACKER_DB;
  });

  test("returns zeros for empty db", () => {
    const data = getSummaryData();
    expect(data.totalDebit).toBe(0);
    expect(data.totalCredit).toBe(0);
    expect(data.transactionCount).toBe(0);
    expect(data.categoryBreakdown).toEqual([]);
    expect(data.monthlyTrends).toEqual([]);
  });

  test("computes totals by direction", () => {
    insertTx({ amount: 500, direction: "debit" });
    insertTx({ amount: 300, direction: "debit" });
    insertTx({ amount: 1000, direction: "credit" });

    const data = getSummaryData();
    expect(data.totalDebit).toBe(800);
    expect(data.totalCredit).toBe(1000);
    expect(data.transactionCount).toBe(3);
  });

  test("category breakdown defaults to debits", () => {
    insertTx({ amount: 500, direction: "debit", category: "Food" });
    insertTx({ amount: 300, direction: "debit", category: "Transport" });
    insertTx({ amount: 1000, direction: "credit", category: "Transfer" });

    const data = getSummaryData();
    expect(data.categoryBreakdown.length).toBe(2);
    expect(data.categoryBreakdown[0].category).toBe("Food");
    expect(data.categoryBreakdown[0].total).toBe(500);
    expect(data.categoryBreakdown[0].percent).toBeCloseTo(62.5, 1);
    expect(data.categoryBreakdown[1].category).toBe("Transport");
  });

  test("category breakdown respects explicit direction filter", () => {
    insertTx({ amount: 500, direction: "debit", category: "Food" });
    insertTx({ amount: 1000, direction: "credit", category: "Transfer" });

    const data = getSummaryData({ direction: "credit" });
    expect(data.categoryBreakdown.length).toBe(1);
    expect(data.categoryBreakdown[0].category).toBe("Transfer");
  });

  test("monthly trends ordered by month", () => {
    insertTx({ amount: 500, date: "2025-01-15T10:00:00Z" });
    insertTx({ amount: 300, date: "2025-02-10T10:00:00Z" });
    insertTx({ amount: 200, date: "2025-01-20T10:00:00Z" });

    const data = getSummaryData();
    expect(data.monthlyTrends.length).toBe(2);
    expect(data.monthlyTrends[0].month).toBe("2025-01");
    expect(data.monthlyTrends[0].total).toBe(700);
    expect(data.monthlyTrends[0].count).toBe(2);
    expect(data.monthlyTrends[1].month).toBe("2025-02");
  });

  test("date filters work", () => {
    insertTx({ amount: 500, date: "2025-01-15T10:00:00Z" });
    insertTx({ amount: 300, date: "2025-03-10T10:00:00Z" });

    const data = getSummaryData({ startDate: "2025-02-01", endDate: "2025-12-31" });
    expect(data.transactionCount).toBe(1);
    expect(data.totalDebit).toBe(300);
  });
});

describe("summaryCommand", () => {
  beforeEach(setupDb);
  afterEach(() => {
    closeDb();
    delete process.env.EXPENSE_TRACKER_DB;
  });

  test("prints 'No transactions found.' when empty", async () => {
    const logs: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    await summaryCommand([]);
    expect(logs).toContain("No transactions found.");
    spy.mockRestore();
  });

  test("prints summary with data", async () => {
    insertTx({ amount: 500, direction: "debit", category: "Food" });
    insertTx({ amount: 1000, direction: "credit", category: "Transfer" });

    const logs: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    await summaryCommand([]);
    const output = logs.join("\n");
    expect(output).toContain("Expense Summary");
    expect(output).toContain("Category Breakdown");
    expect(output).toContain("Monthly Trends");
    expect(output).toContain("Food");
    spy.mockRestore();
  });
});
