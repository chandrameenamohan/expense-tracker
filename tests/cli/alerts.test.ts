import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getDb, _setDb, _resetDb, closeDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import {
  generateAlerts,
  getCategorySpending,
  weekStart,
  printAlerts,
} from "../../src/cli/alerts";

function setupDb() {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");
  _setDb(db);
  runMigrations(db);
}

let emailCounter = 0;

function insertTx(
  date: string,
  amount: number,
  category: string,
  merchant = "TestMerchant",
  direction = "debit",
) {
  const db = getDb();
  emailCounter++;
  const emailId = `email-${emailCounter}-${Math.random()}`;
  const id = `tx-${emailCounter}-${Math.random()}`;
  // Insert raw_email to satisfy FK
  db.prepare(
    `INSERT OR IGNORE INTO raw_emails (message_id, from_address, subject, date, body_text)
     VALUES (?, 'test@test.com', 'Test', ?, 'body')`,
  ).run(emailId, date);
  db.prepare(
    `INSERT INTO transactions (id, email_message_id, date, amount, currency, direction, type, merchant, account, bank, source, confidence, needs_review, category)
     VALUES (?, ?, ?, ?, 'INR', ?, 'upi', ?, 'acc', 'HDFC', 'regex', 1.0, 0, ?)`,
  ).run(id, emailId, date, amount, direction, merchant, category);
}

describe("weekStart", () => {
  it("returns Monday for a Wednesday", () => {
    // 2025-01-15 is a Wednesday
    expect(weekStart(new Date("2025-01-15"))).toBe("2025-01-13");
  });

  it("returns same day for a Monday", () => {
    expect(weekStart(new Date("2025-01-13"))).toBe("2025-01-13");
  });

  it("returns previous Monday for a Sunday", () => {
    // 2025-01-19 is a Sunday
    expect(weekStart(new Date("2025-01-19"))).toBe("2025-01-13");
  });
});

describe("getCategorySpending", () => {
  beforeEach(setupDb);
  afterEach(() => { closeDb(); _resetDb(); });

  it("returns spending grouped by category", () => {
    insertTx("2025-01-15", 500, "Food");
    insertTx("2025-01-15", 300, "Food");
    insertTx("2025-01-15", 1000, "Transport");

    const result = getCategorySpending("2025-01-01", "2025-01-31");
    expect(result.length).toBe(2);

    const food = result.find((r) => r.category === "Food");
    expect(food?.total).toBe(800);
    expect(food?.count).toBe(2);
  });

  it("excludes credits", () => {
    insertTx("2025-01-15", 500, "Food", "M", "credit");
    const result = getCategorySpending("2025-01-01", "2025-01-31");
    expect(result.length).toBe(0);
  });
});

describe("generateAlerts", () => {
  beforeEach(setupDb);
  afterEach(() => { closeDb(); _resetDb(); });

  it("returns empty array when no transactions", () => {
    const alerts = generateAlerts(new Date("2025-01-15"));
    expect(alerts).toEqual([]);
  });

  it("detects spending spike in a category", () => {
    // Trailing 4 weeks: ₹1000/week on Food
    insertTx("2024-12-16", 1000, "Food");
    insertTx("2024-12-23", 1000, "Food");
    insertTx("2024-12-30", 1000, "Food");
    insertTx("2025-01-06", 1000, "Food");

    // Current week (Jan 13-19): ₹2000 on Food = 100% more
    insertTx("2025-01-15", 2000, "Food");

    // Now = Wednesday Jan 15
    const alerts = generateAlerts(new Date("2025-01-15"));
    const spikes = alerts.filter((a) => a.type === "spending_spike");
    expect(spikes.length).toBe(1);
    expect(spikes[0].message).toContain("Food");
    expect(spikes[0].message).toContain("100%");
  });

  it("does not alert when spending is within threshold", () => {
    // Trailing: ₹1000/week
    insertTx("2024-12-16", 1000, "Food");
    insertTx("2024-12-23", 1000, "Food");
    insertTx("2024-12-30", 1000, "Food");
    insertTx("2025-01-06", 1000, "Food");

    // Current week: ₹1200 (20% more, below 40% threshold)
    insertTx("2025-01-15", 1200, "Food");

    const alerts = generateAlerts(new Date("2025-01-15"));
    const spikes = alerts.filter((a) => a.type === "spending_spike");
    expect(spikes.length).toBe(0);
  });

  it("detects new category spending", () => {
    // No trailing data, but current week has spending
    insertTx("2025-01-15", 500, "Entertainment");

    const alerts = generateAlerts(new Date("2025-01-15"));
    const newCat = alerts.filter((a) => a.type === "new_category");
    expect(newCat.length).toBe(1);
    expect(newCat[0].message).toContain("Entertainment");
  });

  it("detects large transactions", () => {
    insertTx("2025-01-15", 15000, "Shopping", "BigStore");

    const alerts = generateAlerts(new Date("2025-01-15"));
    const large = alerts.filter((a) => a.type === "large_transaction");
    expect(large.length).toBe(1);
    expect(large[0].message).toContain("15,000");
    expect(large[0].message).toContain("BigStore");
  });

  it("does not flag small transactions as large", () => {
    insertTx("2025-01-15", 500, "Food", "SmallCafe");

    const alerts = generateAlerts(new Date("2025-01-15"));
    const large = alerts.filter((a) => a.type === "large_transaction");
    expect(large.length).toBe(0);
  });
});

describe("printAlerts", () => {
  it("prints nothing for empty alerts", () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
    printAlerts([]);
    console.log = orig;
    expect(logs.length).toBe(0);
  });

  it("prints alerts with header", () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
    printAlerts([
      { message: "Test alert", type: "spending_spike" },
    ]);
    console.log = orig;
    expect(logs.some((l) => l.includes("Alerts"))).toBe(true);
    expect(logs.some((l) => l.includes("Test alert"))).toBe(true);
  });
});
