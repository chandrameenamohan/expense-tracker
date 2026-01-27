import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  getMonthOverMonth,
  getCategoryTrends,
  getMerchantPatterns,
  generateSuggestions,
  getInsightsData,
  formatInsightsContext,
} from "../../src/cli/insights";
import { getDb, _resetDb, runMigrations } from "../../src/db";

function setupTestDb() {
  process.env.EXPENSE_TRACKER_DB = ":memory:";
  _resetDb();
  runMigrations();
}

function ensureRawEmail(messageId: string) {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO raw_emails (message_id, from_address, subject, date, body_text)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(messageId, "test@bank.com", "Transaction", "2025-01-15T10:00:00.000Z", "body");
}

let txCounter = 0;
function insertTx(overrides: Record<string, unknown> = {}) {
  const db = getDb();
  txCounter++;
  const defaults = {
    id: `tx-${txCounter}`,
    email_message_id: `msg-${txCounter}`,
    date: "2025-01-15T10:00:00.000Z",
    amount: 500,
    currency: "INR",
    direction: "debit",
    type: "upi",
    merchant: "Swiggy",
    account: "1234",
    bank: "HDFC",
    category: "Food",
    source: "regex",
    confidence: 1.0,
    needs_review: 0,
  };
  const row = { ...defaults, ...overrides };
  ensureRawEmail(row.email_message_id as string);
  db.prepare(
    `INSERT INTO transactions (id, email_message_id, date, amount, currency, direction, type, merchant, account, bank, category, source, confidence, needs_review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id, row.email_message_id, row.date, row.amount, row.currency,
    row.direction, row.type, row.merchant, row.account, row.bank,
    row.category, row.source, row.confidence, row.needs_review,
  );
}

describe("insights", () => {
  beforeEach(() => {
    txCounter = 0;
    setupTestDb();
  });
  afterEach(() => {
    delete process.env.EXPENSE_TRACKER_DB;
    _resetDb();
  });

  test("getMonthOverMonth returns empty for no data", () => {
    expect(getMonthOverMonth()).toEqual([]);
  });

  test("getMonthOverMonth returns empty for single month", () => {
    insertTx({ date: "2025-01-15T10:00:00.000Z" });
    expect(getMonthOverMonth()).toEqual([]);
  });

  test("getMonthOverMonth computes change across months", () => {
    insertTx({ date: "2025-01-15T10:00:00.000Z", amount: 1000 });
    insertTx({ date: "2025-02-15T10:00:00.000Z", amount: 1500 });

    const result = getMonthOverMonth();
    expect(result).toHaveLength(1);
    expect(result[0].month).toBe("2025-02");
    expect(result[0].total).toBe(1500);
    expect(result[0].prevTotal).toBe(1000);
    expect(result[0].changePercent).toBe(50);
  });

  test("getMonthOverMonth handles three months", () => {
    insertTx({ date: "2025-01-15T10:00:00.000Z", amount: 1000 });
    insertTx({ date: "2025-02-15T10:00:00.000Z", amount: 2000 });
    insertTx({ date: "2025-03-15T10:00:00.000Z", amount: 1000 });

    const result = getMonthOverMonth();
    expect(result).toHaveLength(2);
    expect(result[0].changePercent).toBe(100); // Jan→Feb doubled
    expect(result[1].changePercent).toBe(-50); // Feb→Mar halved
  });

  test("getCategoryTrends returns empty for no data", () => {
    expect(getCategoryTrends()).toEqual([]);
  });

  test("getCategoryTrends returns empty for single month", () => {
    insertTx({ date: "2025-01-15T10:00:00.000Z", category: "Food" });
    expect(getCategoryTrends()).toEqual([]);
  });

  test("getCategoryTrends computes category changes", () => {
    insertTx({ date: "2025-01-15T10:00:00.000Z", amount: 1000, category: "Food" });
    insertTx({ date: "2025-02-15T10:00:00.000Z", amount: 1500, category: "Food" });
    insertTx({ date: "2025-01-15T10:00:00.000Z", amount: 500, category: "Transport" });
    // Transport absent in Feb

    const result = getCategoryTrends();
    expect(result.length).toBeGreaterThanOrEqual(1);
    const food = result.find((r) => r.category === "Food");
    expect(food).toBeDefined();
    expect(food!.currentMonth).toBe(1500);
    expect(food!.previousMonth).toBe(1000);
    expect(food!.changePercent).toBe(50);
  });

  test("getMerchantPatterns returns empty for no data", () => {
    expect(getMerchantPatterns()).toEqual([]);
  });

  test("getMerchantPatterns requires at least 2 transactions", () => {
    insertTx({ merchant: "Swiggy", amount: 500 });
    expect(getMerchantPatterns()).toEqual([]);
  });

  test("getMerchantPatterns detects recurring merchants", () => {
    insertTx({ merchant: "Swiggy", amount: 300, date: "2025-01-01T10:00:00.000Z" });
    insertTx({ merchant: "Swiggy", amount: 400, date: "2025-01-08T10:00:00.000Z" });
    insertTx({ merchant: "Swiggy", amount: 350, date: "2025-01-15T10:00:00.000Z" });

    const result = getMerchantPatterns();
    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe("Swiggy");
    expect(result[0].totalSpent).toBe(1050);
    expect(result[0].transactionCount).toBe(3);
    expect(result[0].frequency).toBe("weekly");
  });

  test("getMerchantPatterns classifies monthly frequency", () => {
    insertTx({ merchant: "Netflix", amount: 649, date: "2025-01-01T10:00:00.000Z" });
    insertTx({ merchant: "Netflix", amount: 649, date: "2025-02-01T10:00:00.000Z" });

    const result = getMerchantPatterns();
    expect(result).toHaveLength(1);
    expect(result[0].frequency).toBe("monthly");
  });

  test("generateSuggestions flags category spikes", () => {
    const trends = [
      { category: "Food", currentMonth: 5000, previousMonth: 2000, changePercent: 150 },
    ];
    const suggestions = generateSuggestions(trends, []);
    expect(suggestions.some((s) => s.type === "category_spike")).toBe(true);
    expect(suggestions[0].message).toContain("Food");
  });

  test("generateSuggestions flags recurring high-spend merchants", () => {
    const patterns = [
      { merchant: "Swiggy", totalSpent: 5000, transactionCount: 10, avgAmount: 500, frequency: "weekly" as const },
    ];
    const suggestions = generateSuggestions([], patterns);
    expect(suggestions.some((s) => s.type === "recurring_high")).toBe(true);
  });

  test("generateSuggestions flags top merchant dominance", () => {
    const patterns = [
      { merchant: "Amazon", totalSpent: 8000, transactionCount: 5, avgAmount: 1600, frequency: "monthly" as const },
      { merchant: "Swiggy", totalSpent: 1000, transactionCount: 3, avgAmount: 333, frequency: "weekly" as const },
      { merchant: "Uber", totalSpent: 500, transactionCount: 2, avgAmount: 250, frequency: "occasional" as const },
    ];
    const suggestions = generateSuggestions([], patterns);
    expect(suggestions.some((s) => s.type === "top_merchant")).toBe(true);
    expect(suggestions.find((s) => s.type === "top_merchant")!.message).toContain("Amazon");
  });

  test("generateSuggestions notes spending drops", () => {
    const trends = [
      { category: "Shopping", currentMonth: 500, previousMonth: 3000, changePercent: -83 },
    ];
    const suggestions = generateSuggestions(trends, []);
    expect(suggestions.some((s) => s.type === "savings_opportunity")).toBe(true);
  });

  test("getInsightsData returns full structure", () => {
    insertTx({ date: "2025-01-15T10:00:00.000Z", amount: 1000, category: "Food", merchant: "Swiggy" });
    insertTx({ date: "2025-01-20T10:00:00.000Z", amount: 500, category: "Food", merchant: "Swiggy" });
    insertTx({ date: "2025-02-15T10:00:00.000Z", amount: 2000, category: "Food", merchant: "Swiggy" });

    const data = getInsightsData();
    expect(data).toHaveProperty("monthOverMonth");
    expect(data).toHaveProperty("categoryTrends");
    expect(data).toHaveProperty("merchantPatterns");
    expect(data).toHaveProperty("suggestions");
  });

  test("formatInsightsContext returns empty for no data", () => {
    const data = { monthOverMonth: [], categoryTrends: [], merchantPatterns: [], suggestions: [] };
    expect(formatInsightsContext(data).trim()).toBe("");
  });

  test("formatInsightsContext includes all sections", () => {
    const data = {
      monthOverMonth: [{ month: "2025-02", total: 1500, prevTotal: 1000, changePercent: 50 }],
      categoryTrends: [{ category: "Food", currentMonth: 1500, previousMonth: 1000, changePercent: 50 }],
      merchantPatterns: [{ merchant: "Swiggy", totalSpent: 3000, transactionCount: 5, avgAmount: 600, frequency: "weekly" as const }],
      suggestions: [{ message: "Food spending up 50%", type: "category_spike" as const }],
    };
    const text = formatInsightsContext(data);
    expect(text).toContain("Month-over-month");
    expect(text).toContain("Category trends");
    expect(text).toContain("Recurring merchant");
    expect(text).toContain("Notable patterns");
    expect(text).toContain("Swiggy");
  });
});
