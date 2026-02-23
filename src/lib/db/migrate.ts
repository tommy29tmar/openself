import fs from "node:fs";
import path from "node:path";
import { sqlite } from "./index";

export function runMigrations(): void {
  // Create migration tracking table
  sqlite.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    filename TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const migrationsDir = path.resolve("db/migrations");
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
      console.log(`Skip (already applied): ${file}`);
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
    console.log(`Applied: ${file}`);
  }

  console.log(`All migrations applied (${files.length} total, ${files.length - applied.size} new).`);
}
