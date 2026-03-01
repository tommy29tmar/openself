import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

/**
 * Increment this when adding new migrations.
 * Worker (follower mode) will poll schema_meta until this version appears.
 */
export const EXPECTED_SCHEMA_VERSION = 21;

export function runMigrations(sqlite: Database.Database): void {
  // Create migration tracking table
  sqlite.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    filename TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // In production Docker, migrations are at /app/migrations (outside the volume-mounted /app/db).
  // In development, they are at db/migrations (relative to project root).
  const prodDir = path.resolve("migrations");
  const devDir = path.resolve("db/migrations");
  const migrationsDir = fs.existsSync(prodDir) ? prodDir : devDir;
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    sqlite
      .prepare("SELECT filename FROM _migrations")
      .all()
      .map((r: any) => r.filename),
  );

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sqlContent = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    const usesVirtualTable = /CREATE\s+VIRTUAL\s+TABLE/i.test(sqlContent);

    if (usesVirtualTable) {
      // FTS/virtual-table DDL can fail when wrapped in explicit transactions.
      // Apply directly, then track as applied.
      sqlite.exec(sqlContent);
      sqlite
        .prepare("INSERT INTO _migrations (filename) VALUES (?)")
        .run(file);
    } else {
      // Wrap migration + tracking insert in a single transaction
      // If migration fails, nothing is recorded (rollback)
      // If tracking insert fails, migration is rolled back
      const applyMigration = sqlite.transaction(() => {
        sqlite.exec(sqlContent);
        sqlite
          .prepare("INSERT INTO _migrations (filename) VALUES (?)")
          .run(file);
      });

      applyMigration();
    }
    console.log(`[migrate] Applied: ${file}`);
  }

  // Write schema version to schema_meta (created by 0012_owner_scoping.sql or later)
  // Use try-catch: schema_meta may not exist if running migrations < 0012
  try {
    sqlite
      .prepare(
        "INSERT OR REPLACE INTO schema_meta(key, value, updated_at) VALUES ('schema_version', ?, datetime('now'))",
      )
      .run(String(EXPECTED_SCHEMA_VERSION));
  } catch {
    // schema_meta table doesn't exist yet — pre-0012 state, skip
  }
}

/**
 * Async poll for schema readiness. Used by worker (follower mode) to wait
 * for the web process (leader) to complete migrations.
 */
export async function awaitSchema(
  sqlite: Database.Database,
  expected: number,
  maxRetries = 30,
  delayMs = 1000,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const row = sqlite
        .prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'")
        .get() as { value: string } | undefined;
      if (row && parseInt(row.value) >= expected) return;
    } catch {
      /* table may not exist yet */
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(
    `Schema not ready after ${maxRetries}s. Expected version ${expected}.`,
  );
}
