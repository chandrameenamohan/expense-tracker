import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "..", "src", "db", "migrations");
const SCHEMA_SQL = readFileSync(join(MIGRATIONS_DIR, "001-initial-schema.sql"), "utf-8");
const SEED_SQL = readFileSync(join(MIGRATIONS_DIR, "002-seed-categories.sql"), "utf-8");

describe("seed categories migration", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    db.exec(SEED_SQL);
  });

  afterEach(() => {
    db.close();
  });

  test("seeds 10 default categories", () => {
    const rows = db.query("SELECT name FROM categories ORDER BY name").all() as { name: string }[];
    expect(rows).toHaveLength(10);
  });

  test("contains all expected category names", () => {
    const rows = db.query("SELECT name FROM categories ORDER BY name").all() as { name: string }[];
    const names = rows.map((r) => r.name);
    for (const expected of [
      "Food", "Transport", "Shopping", "Bills", "Entertainment",
      "Health", "Education", "Investment", "Transfer", "Other",
    ]) {
      expect(names).toContain(expected);
    }
  });
});
