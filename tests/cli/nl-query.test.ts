import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  isReadOnlyQuery,
  executeQuery,
  formatResults,
  answerQuery,
} from "../../src/cli/commands/nl-query";
import { getDb, _resetDb, runMigrations } from "../../src/db";
import type { ClaudeCli } from "../../src/categorizer/claude-cli";

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

function insertTx(overrides: Record<string, unknown> = {}) {
  const db = getDb();
  const defaults = {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    email_message_id: "msg-1",
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

describe("isReadOnlyQuery", () => {
  test("allows SELECT", () => {
    expect(isReadOnlyQuery("SELECT * FROM transactions")).toBe(true);
  });

  test("allows WITH (CTE)", () => {
    expect(isReadOnlyQuery("WITH cte AS (SELECT 1) SELECT * FROM cte")).toBe(true);
  });

  test("rejects INSERT", () => {
    expect(isReadOnlyQuery("INSERT INTO transactions VALUES (1)")).toBe(false);
  });

  test("rejects DELETE", () => {
    expect(isReadOnlyQuery("DELETE FROM transactions")).toBe(false);
  });

  test("rejects DROP", () => {
    expect(isReadOnlyQuery("DROP TABLE transactions")).toBe(false);
  });

  test("rejects UPDATE", () => {
    expect(isReadOnlyQuery("UPDATE transactions SET amount = 0")).toBe(false);
  });

  test("rejects SELECT with embedded DELETE", () => {
    expect(isReadOnlyQuery("SELECT 1; DELETE FROM transactions")).toBe(false);
  });

  test("rejects PRAGMA", () => {
    expect(isReadOnlyQuery("PRAGMA table_info(transactions)")).toBe(false);
  });

  test("rejects ATTACH", () => {
    expect(isReadOnlyQuery("ATTACH DATABASE '/tmp/x.db' AS x")).toBe(false);
  });
});

describe("executeQuery", () => {
  beforeEach(setupTestDb);
  afterEach(() => {
    delete process.env.EXPENSE_TRACKER_DB;
    _resetDb();
  });

  test("executes valid SELECT", () => {
    insertTx();
    const result = executeQuery("SELECT COUNT(*) as cnt FROM transactions");
    expect(result.error).toBeUndefined();
    expect(result.rows).toHaveLength(1);
    expect((result.rows[0] as any).cnt).toBe(1);
  });

  test("rejects write queries", () => {
    const result = executeQuery("DELETE FROM transactions");
    expect(result.error).toContain("only SELECT");
    expect(result.rows).toHaveLength(0);
  });

  test("returns error for bad SQL", () => {
    const result = executeQuery("SELECT * FROM nonexistent_table");
    expect(result.error).toContain("SQL error");
  });
});

describe("formatResults", () => {
  test("formats empty results", () => {
    expect(formatResults([])).toBe("No results found.");
  });

  test("formats rows as table", () => {
    const rows = [
      { merchant: "Swiggy", total: 500 },
      { merchant: "Amazon", total: 1200 },
    ];
    const result = formatResults(rows);
    expect(result).toContain("merchant | total");
    expect(result).toContain("Swiggy | 500");
    expect(result).toContain("Amazon | 1200");
  });
});

describe("answerQuery", () => {
  beforeEach(setupTestDb);
  afterEach(() => {
    delete process.env.EXPENSE_TRACKER_DB;
    _resetDb();
  });

  test("full flow: generates SQL, executes, interprets", () => {
    insertTx({ merchant: "Swiggy", amount: 500 });
    insertTx({ id: "tx-2", email_message_id: "msg-2", merchant: "Zomato", amount: 300 });

    let callCount = 0;
    const cli: ClaudeCli = {
      run: ({ prompt }) => {
        callCount++;
        if (callCount === 1) {
          // SQL generation step
          return { success: true, output: "SELECT merchant, SUM(amount) as total FROM transactions WHERE direction = 'debit' GROUP BY merchant ORDER BY total DESC" };
        }
        // Interpretation step
        return { success: true, output: "Swiggy: ₹500, Zomato: ₹300" };
      },
      runJson: () => null,
      isAvailable: () => true,
    };

    const result = answerQuery(cli, "what are my top merchants?");
    expect(result.answer).toContain("Swiggy");
    expect(result.sql).toBeDefined();
    expect(result.rows).toHaveLength(2);
  });

  test("handles SQL generation failure", () => {
    const cli: ClaudeCli = {
      run: () => ({ success: false, output: "", error: "CLI unavailable" }),
      runJson: () => null,
      isAvailable: () => false,
    };

    const result = answerQuery(cli, "how much did I spend?");
    expect(result.answer).toContain("Could not generate query");
    expect(result.error).toBeDefined();
  });

  test("handles CANNOT_ANSWER response", () => {
    const cli: ClaudeCli = {
      run: () => ({ success: true, output: "SELECT 'CANNOT_ANSWER' as error;" }),
      runJson: () => null,
      isAvailable: () => true,
    };

    const result = answerQuery(cli, "what's the weather?");
    expect(result.answer).toContain("can't answer");
  });

  test("handles bad SQL from AI", () => {
    const cli: ClaudeCli = {
      run: () => ({ success: true, output: "SELECT * FROM nonexistent" }),
      runJson: () => null,
      isAvailable: () => true,
    };

    const result = answerQuery(cli, "show me stuff");
    expect(result.answer).toContain("Query failed");
    expect(result.error).toBeDefined();
  });

  test("falls back to raw results when interpretation fails", () => {
    insertTx({ merchant: "Swiggy", amount: 500 });

    let callCount = 0;
    const cli: ClaudeCli = {
      run: () => {
        callCount++;
        if (callCount === 1) {
          return { success: true, output: "SELECT COUNT(*) as cnt FROM transactions" };
        }
        return { success: false, output: "", error: "interpret failed" };
      },
      runJson: () => null,
      isAvailable: () => true,
    };

    const result = answerQuery(cli, "how many transactions?");
    expect(result.answer).toContain("cnt");
    expect(result.answer).toContain("1");
  });

  test("strips markdown fences from SQL output", () => {
    insertTx();

    let callCount = 0;
    const cli: ClaudeCli = {
      run: () => {
        callCount++;
        if (callCount === 1) {
          return { success: true, output: "```sql\nSELECT COUNT(*) as cnt FROM transactions\n```" };
        }
        return { success: true, output: "You have 1 transaction." };
      },
      runJson: () => null,
      isAvailable: () => true,
    };

    const result = answerQuery(cli, "how many?");
    expect(result.answer).toContain("1 transaction");
  });
});
