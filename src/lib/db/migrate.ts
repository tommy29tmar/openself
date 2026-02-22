import fs from "node:fs";
import path from "node:path";
import { sqlite } from "./index";

export function runMigrations(): void {
  const migrationsDir = path.resolve("db/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    sqlite.exec(sql);
    console.log(`Applied migration: ${file}`);
  }

  console.log(`All migrations applied (${files.length} files).`);
}
