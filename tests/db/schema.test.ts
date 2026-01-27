import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA_SQL = readFileSync(
  join(import.meta.dir, "..", "..", "src", "db", "migrations", "001-initial-schema.sql"),
  "utf-8",
);

describe("initial schema migration", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");
    db.exec(SCHEMA_SQL);
  });

  afterEach(() => {
    db.close();
  });

  test("creates all expected tables", () => {
    const tables = db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain("raw_emails");
    expect(names).toContain("transactions");
    expect(names).toContain("sync_state");
    expect(names).toContain("categories");
    expect(names).toContain("category_corrections");
  });

  test("creates transaction indexes", () => {
    const indexes = db
      .query("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);

    expect(names).toContain("idx_transactions_date");
    expect(names).toContain("idx_transactions_type");
    expect(names).toContain("idx_transactions_category");
    expect(names).toContain("idx_transactions_needs_review");
    expect(names).toContain("idx_transactions_email_message_id");
    expect(names).toContain("idx_corrections_merchant");
  });

  test("raw_emails table accepts valid data", () => {
    db.run(
      "INSERT INTO raw_emails (message_id, from_address, subject, date, body_text) VALUES (?, ?, ?, ?, ?)",
      ["msg-1", "bank@example.com", "Transaction Alert", "2024-01-15T10:00:00Z", "You spent Rs. 500"],
    );
    const row = db.query("SELECT * FROM raw_emails WHERE message_id = ?").get("msg-1") as Record<string, unknown>;
    expect(row.from_address).toBe("bank@example.com");
  });

  test("transactions table enforces direction check constraint", () => {
    db.run(
      "INSERT INTO raw_emails (message_id, from_address, subject, date, body_text) VALUES (?, ?, ?, ?, ?)",
      ["msg-1", "bank@example.com", "Alert", "2024-01-15T10:00:00Z", "body"],
    );
    expect(() =>
      db.run(
        `INSERT INTO transactions (id, email_message_id, date, amount, direction, type, merchant, source)
         VALUES ('t1', 'msg-1', '2024-01-15', 500, 'invalid', 'upi', 'Shop', 'regex')`,
      ),
    ).toThrow();
  });

  test("transactions table enforces composite unique constraint", () => {
    db.run(
      "INSERT INTO raw_emails (message_id, from_address, subject, date, body_text) VALUES (?, ?, ?, ?, ?)",
      ["msg-1", "bank@example.com", "Alert", "2024-01-15T10:00:00Z", "body"],
    );
    const sql = `INSERT INTO transactions (id, email_message_id, date, amount, direction, type, merchant, source)
                 VALUES (?, 'msg-1', '2024-01-15', 500, 'debit', 'upi', 'Shop', 'regex')`;
    db.run(sql, ["t1"]);
    expect(() => db.run(sql, ["t2"])).toThrow();
  });

  test("transactions table allows multiple transactions per email", () => {
    db.run(
      "INSERT INTO raw_emails (message_id, from_address, subject, date, body_text) VALUES (?, ?, ?, ?, ?)",
      ["msg-1", "bank@example.com", "Alert", "2024-01-15T10:00:00Z", "body"],
    );
    db.run(
      `INSERT INTO transactions (id, email_message_id, date, amount, direction, type, merchant, source)
       VALUES ('t1', 'msg-1', '2024-01-15', 500, 'debit', 'upi', 'Shop A', 'regex')`,
    );
    db.run(
      `INSERT INTO transactions (id, email_message_id, date, amount, direction, type, merchant, source)
       VALUES ('t2', 'msg-1', '2024-01-15', 300, 'debit', 'upi', 'Shop B', 'regex')`,
    );
    const rows = db.query("SELECT * FROM transactions WHERE email_message_id = ?").all("msg-1");
    expect(rows).toHaveLength(2);
  });

  test("foreign key enforced on transactions.email_message_id", () => {
    expect(() =>
      db.run(
        `INSERT INTO transactions (id, email_message_id, date, amount, direction, type, merchant, source)
         VALUES ('t1', 'nonexistent', '2024-01-15', 500, 'debit', 'upi', 'Shop', 'regex')`,
      ),
    ).toThrow();
  });
});
