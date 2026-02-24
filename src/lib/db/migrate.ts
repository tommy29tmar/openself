import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

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
    console.log(`[migrate] Applied: ${file}`);
  }
}
