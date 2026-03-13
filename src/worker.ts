/**
 * Standalone worker process for async job processing.
 *
 * Bootstrap mode: follower (waits for web/leader to run migrations).
 * Build: tsup src/worker.ts --format cjs --out-dir dist --external better-sqlite3
 * Run: node dist/worker.js
 * Health check: node dist/worker.js --health-check
 */

import { sqlite } from "@/lib/db";
import { awaitSchema, EXPECTED_SCHEMA_VERSION } from "@/lib/db/migrate";
import { processJobs, getHandlerCount } from "@/lib/worker/index";
import { runSchedulerTick, SCHEDULER_INTERVAL_MS } from "@/lib/worker/scheduler";

const POLL_INTERVAL_MS = 5_000; // 5 seconds
const EXPECTED_HANDLER_COUNT = 13;

async function healthCheck(): Promise<void> {
  // 1. Verify DB connection
  try {
    sqlite.prepare("SELECT 1").get();
  } catch (err) {
    console.error("[worker] Health check: DB connection failed", err);
    process.exit(1);
  }

  // 2. Verify schema ready
  try {
    await awaitSchema(sqlite, EXPECTED_SCHEMA_VERSION, 5, 500);
  } catch (err) {
    console.error("[worker] Health check: Schema not ready", err);
    process.exit(1);
  }

  // 3. Verify handlers registered
  const handlerCount = getHandlerCount();
  if (handlerCount < EXPECTED_HANDLER_COUNT) {
    console.error(
      `[worker] Health check: Expected ${EXPECTED_HANDLER_COUNT} handlers, got ${handlerCount}`,
    );
    process.exit(1);
  }

  console.log("[worker] Health check passed");
  process.exit(0);
}

async function main(): Promise<void> {
  // Check for health-check flag
  if (process.argv.includes("--health-check")) {
    await healthCheck();
    return;
  }

  console.log("[worker] Starting (follower mode, awaiting schema)...");

  // Wait for leader to run migrations
  await awaitSchema(sqlite, EXPECTED_SCHEMA_VERSION);
  console.log(`[worker] Schema ready (version ${EXPECTED_SCHEMA_VERSION})`);

  // Start processing loop
  console.log(`[worker] Processing loop started (interval: ${POLL_INTERVAL_MS}ms)`);

  const poll = async () => {
    try {
      const count = await processJobs();
      if (count > 0) {
        console.log(`[worker] Processed ${count} job(s)`);
      }
    } catch (err) {
      console.error("[worker] Error processing jobs:", err);
    }
  };

  // Initial poll
  await poll();

  // Periodic poll
  setInterval(poll, POLL_INTERVAL_MS);

  // Scheduler: enqueue heartbeat jobs for active owners
  console.log(`[worker] Scheduler started (interval: ${SCHEDULER_INTERVAL_MS / 1000}s)`);
  await runSchedulerTick();
  setInterval(runSchedulerTick, SCHEDULER_INTERVAL_MS);
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
