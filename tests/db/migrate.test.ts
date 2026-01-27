import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { _resetDb, _setDb, closeDb, runMigrations } from "../../src/db";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const TEMP_DIR = join(import.meta.dir, "..", "..", ".test-data", "test-migrations");

function writeMigration(id: number, name: string, sql: string) {
  const padded = String(id).padStart(3, "0");
  writeFileSync(join(TEMP_DIR, `${padded}-${name}.sql`), sql);
}

describe("migration runner", () => {
  let db: Database;

  beforeEach(() => {
    try { rmSync(TEMP_DIR, { recursive: true }); } catch {}
    mkdirSync(TEMP_DIR, { recursive: true });
    db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");
    _setDb(db);
  });

  afterEach(() => {
    closeDb();
    _resetDb();
    try { rmSync(TEMP_DIR, { recursive: true }); } catch {}
  });

  test("creates migrations table if not exists", () => {
    runMigrations(db, TEMP_DIR);
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'")
      .all();
    expect(tables).toHaveLength(1);
  });

  test("applies SQL migration files in order", () => {
    writeMigration(1, "create-foo", "CREATE TABLE foo (id INTEGER PRIMARY KEY);");
    writeMigration(2, "create-bar", "CREATE TABLE bar (id INTEGER PRIMARY KEY);");

    runMigrations(db, TEMP_DIR);

    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("foo");
    expect(names).toContain("bar");
    expect(names).toContain("migrations");
  });

  test("records applied migrations", () => {
    writeMigration(1, "create-foo", "CREATE TABLE foo (id INTEGER PRIMARY KEY);");
    runMigrations(db, TEMP_DIR);

    const applied = db.query("SELECT id, name FROM migrations").all() as {
      id: number;
      name: string;
    }[];
    expect(applied).toHaveLength(1);
    expect(applied[0].id).toBe(1);
    expect(applied[0].name).toBe("create-foo");
  });

  test("skips already-applied migrations", () => {
    writeMigration(1, "create-foo", "CREATE TABLE foo (id INTEGER PRIMARY KEY);");
    runMigrations(db, TEMP_DIR);
    runMigrations(db, TEMP_DIR);

    const applied = db.query("SELECT id FROM migrations").all();
    expect(applied).toHaveLength(1);
  });

  test("rolls back on failure", () => {
    writeMigration(1, "create-foo", "CREATE TABLE foo (id INTEGER PRIMARY KEY);");
    writeMigration(2, "bad-migration", "INVALID SQL HERE;");

    expect(() => runMigrations(db, TEMP_DIR)).toThrow(/Migration 2-bad-migration failed/);

    const applied = db.query("SELECT id FROM migrations").all();
    expect(applied).toHaveLength(1);
  });

  test("handles empty migrations directory", () => {
    runMigrations(db, TEMP_DIR);
    const applied = db.query("SELECT id FROM migrations").all();
    expect(applied).toHaveLength(0);
  });
});
