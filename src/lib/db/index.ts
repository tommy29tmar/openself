import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { runMigrations } from "./migrate";

function resolveDbPath() {
  // Allow explicit override for scripts/tests.
  if (process.env.OPENSELF_DB_PATH) {
    return process.env.OPENSELF_DB_PATH;
  }

  // Vitest can execute files in parallel workers; use per-worker DB files to avoid lock contention.
  const isVitest = process.env.VITEST === "true";
  const workerId = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID;

  if (isVitest && workerId) {
    return path.join(process.cwd(), "db", `openself.test-worker-${workerId}.db`);
  }

  return path.join(process.cwd(), "db", "openself.db");
}

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = ON");

/**
 * Bootstrap mode controls migration behavior:
 * - "leader" (default): runs migrations synchronously at import time (web process)
 * - "follower": skip migrations here; worker calls awaitSchema() in its own async main()
 * - "off": skip entirely (migration-specific tests only)
 */
const bootstrapMode = (process.env.DB_BOOTSTRAP_MODE ?? "leader") as
  | "leader"
  | "follower"
  | "off";

if (bootstrapMode === "leader") {
  runMigrations(sqlite);
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
export { schema };
