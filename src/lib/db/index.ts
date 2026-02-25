import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { runMigrations } from "./migrate";

const sqlite = new Database("db/openself.db");

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
