import Database from "better-sqlite3";
import { runMigrations } from "../src/lib/db/migrate";

try {
  const sqlite = new Database("db/openself.db");
  runMigrations(sqlite);
  console.log("Database initialized successfully.");
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}
