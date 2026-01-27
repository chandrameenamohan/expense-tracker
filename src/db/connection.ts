import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_DB_PATH = join(homedir(), ".expense-tracker", "data.db");

let instance: Database | null = null;

export function getDbPath(): string {
  return process.env.EXPENSE_TRACKER_DB || DEFAULT_DB_PATH;
}

export function getDb(): Database {
  if (!instance) {
    const dbPath = getDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    instance = new Database(dbPath);
    instance.run("PRAGMA journal_mode = WAL");
    instance.run("PRAGMA foreign_keys = ON");
  }
  return instance;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}

/** Reset singleton — for testing only */
export function _resetDb(): void {
  instance = null;
}

/** Set a specific database instance — for testing only */
export function _setDb(db: Database): void {
  instance = db;
}
