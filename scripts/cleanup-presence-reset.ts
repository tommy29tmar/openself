// scripts/cleanup-presence-reset.ts
// ONE-OFF: delete all existing pages + caches for the Presence System clean cut.
// Only run in local dev environments with no real user data.
// Requires explicit ENV confirmation to prevent accidental runs.

import Database from "better-sqlite3";

if (process.env.CONFIRM_RESET !== "yes") {
  console.error("Set CONFIRM_RESET=yes to run this script. Check row counts first.");
  console.error("  SELECT COUNT(*) FROM page;");
  process.exit(1);
}

const db = new Database(process.env.DATABASE_PATH ?? "db/data.db");
const before = (db.prepare("SELECT COUNT(*) as n FROM page").get() as { n: number }).n;
console.log(`Deleting ${before} page rows...`);

db.exec(`
  DELETE FROM page;
  DELETE FROM section_copy_cache;
  DELETE FROM section_copy_state;
  DELETE FROM section_copy_proposals;
  DELETE FROM translation_cache;
`);

const after = (db.prepare("SELECT COUNT(*) as n FROM page").get() as { n: number }).n;
console.log(`Done. page rows remaining: ${after}`);
