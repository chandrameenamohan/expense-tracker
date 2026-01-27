import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { getDb } from "./connection";

const DEFAULT_MIGRATIONS_DIR = join(import.meta.dir, "migrations");

function ensureMigrationsTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function getAppliedMigrations(db: Database): Set<number> {
  const rows = db.query("SELECT id FROM migrations").all() as { id: number }[];
  return new Set(rows.map((r) => r.id));
}

interface MigrationFile {
  id: number;
  name: string;
  path: string;
}

function getMigrationFiles(dir: string): MigrationFile[] {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }

  return files
    .filter((f) => f.endsWith(".sql"))
    .map((f) => {
      const match = f.match(/^(\d+)-(.+)\.sql$/);
      if (!match) return null;
      return {
        id: Number.parseInt(match[1], 10),
        name: match[2],
        path: join(dir, f),
      };
    })
    .filter((m): m is MigrationFile => m !== null)
    .sort((a, b) => a.id - b.id);
}

export function runMigrations(db?: Database, migrationsDir?: string): void {
  const conn = db ?? getDb();
  const dir = migrationsDir ?? DEFAULT_MIGRATIONS_DIR;
  ensureMigrationsTable(conn);

  const applied = getAppliedMigrations(conn);
  const migrations = getMigrationFiles(dir);

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;

    const sql = readFileSync(migration.path, "utf-8");
    conn.run("BEGIN");
    try {
      conn.exec(sql);
      conn.run("INSERT INTO migrations (id, name) VALUES (?, ?)", [
        migration.id,
        migration.name,
      ]);
      conn.run("COMMIT");
    } catch (err) {
      conn.run("ROLLBACK");
      throw new Error(
        `Migration ${migration.id}-${migration.name} failed: ${err}`,
      );
    }
  }
}
