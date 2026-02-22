import { runMigrations } from "../src/lib/db/migrate";

try {
  runMigrations();
  console.log("Database initialized successfully.");
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}
