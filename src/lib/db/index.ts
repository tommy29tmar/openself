import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { runMigrations } from "./migrate";

const sqlite = new Database("db/openself.db");

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = ON");

runMigrations(sqlite);

export const db = drizzle(sqlite, { schema });
export { sqlite };
export { schema };
