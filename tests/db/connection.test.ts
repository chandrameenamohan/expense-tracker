import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getDb, getDbPath, closeDb, _resetDb, _setDb } from "../../src/db";
import { unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const TEST_DB_PATH = join(
  import.meta.dir,
  "..",
  "..",
  ".test-data",
  "test-connection.db",
);

describe("database connection", () => {
  beforeEach(() => {
    closeDb();
    _resetDb();
    mkdirSync(dirname(TEST_DB_PATH), { recursive: true });
    process.env.EXPENSE_TRACKER_DB = TEST_DB_PATH;
  });

  afterEach(() => {
    closeDb();
    _resetDb();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    delete process.env.EXPENSE_TRACKER_DB;
  });

  test("getDbPath returns env var when set", () => {
    process.env.EXPENSE_TRACKER_DB = "/custom/path.db";
    expect(getDbPath()).toBe("/custom/path.db");
  });

  test("getDbPath returns default when env var not set", () => {
    delete process.env.EXPENSE_TRACKER_DB;
    expect(getDbPath()).toBe(join(homedir(), ".expense-tracker", "data.db"));
  });

  test("getDb returns a Database instance", () => {
    const db = getDb();
    expect(db).toBeInstanceOf(Database);
  });

  test("getDb returns singleton", () => {
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });

  test("closeDb closes and clears singleton", () => {
    getDb();
    closeDb();
    // After close, getDb should create a new instance
    const db2 = getDb();
    expect(db2).toBeInstanceOf(Database);
  });

  test("WAL mode is enabled", () => {
    const db = getDb();
    const result = db.query("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(result.journal_mode).toBe("wal");
  });

  test("foreign keys are enabled", () => {
    const db = getDb();
    const result = db.query("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(result.foreign_keys).toBe(1);
  });

  test("_setDb allows injecting a test database", () => {
    const testDb = new Database(":memory:");
    _setDb(testDb);
    expect(getDb()).toBe(testDb);
    testDb.close();
    _resetDb();
  });
});
