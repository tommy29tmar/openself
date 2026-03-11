/**
 * Heartbeat scheduler — auto-enqueues heartbeat_light (daily) and heartbeat_deep (weekly).
 * Also dispatches daily connector_sync jobs for owners with active connectors.
 *
 * Runs as a periodic tick inside the worker process. Each tick checks all active owners
 * and enqueues jobs based on their local timezone:
 * - Light: daily at/after 3 AM local time (catch-up) — deterministic housekeeping, no LLM
 * - Deep: Sunday at/after 3 AM local time (catch-up) — LLM-dependent, gated by minimum fact count
 * - Deep recovery: Monday before noon if previous week's deep was missed
 * - Connector sync: daily, per-connector guard using owner's timezone
 */

import {
  getActiveOwnerKeys,
  getHeartbeatConfig,
  hasRunToday,
  hasRunThisWeek,
  hasRunInWeek,
  computeOwnerWeek,
  computeOwnerDay,
  getPreviousWeek,
} from "@/lib/services/heartbeat-config-service";
import { enqueueJob } from "@/lib/worker/index";
import { sqlite } from "@/lib/db";
import { DEEP_HEARTBEAT_MIN_FACTS } from "@/lib/agent/thresholds";
import { runGlobalHousekeeping } from "@/lib/worker/heartbeat";
import { getActiveFacts } from "@/lib/services/kb-service";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getActiveConnectors } from "@/lib/connectors/connector-service";

/** Scheduler runs every 15 minutes. */
export const SCHEDULER_INTERVAL_MS = 15 * 60_000;

/** Anti-overlap flag — prevents concurrent scheduler ticks. */
let isSchedulerRunning = false;

/**
 * Get the current hour (0–23) in the given timezone.
 */
export function getLocalHour(timezone: string): number {
  const tz = timezone || "UTC";
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  return parseInt(hour, 10);
}

/**
 * Get the current day of week (0=Sunday, 1=Monday, ..., 6=Saturday) in the given timezone.
 */
export function getLocalDayOfWeek(timezone: string): number {
  const tz = timezone || "UTC";
  const dayStr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(new Date());

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[dayStr] ?? 0;
}

/**
 * Check if an owner has enough active facts for deep heartbeat.
 * Uses the same fact resolution logic as the rest of the system
 * (cognitiveOwnerKey in canonical mode, readKeys otherwise).
 */
function hasEnoughFactsForDeep(ownerKey: string): boolean {
  const scope = resolveOwnerScopeForWorker(ownerKey);
  const facts = getActiveFacts(scope.cognitiveOwnerKey, scope.knowledgeReadKeys);
  return facts.length >= DEEP_HEARTBEAT_MIN_FACTS;
}

/**
 * Single scheduler tick. Iterates all active owners and enqueues due heartbeat jobs.
 *
 * Anti-overlap: if a previous tick is still running, this call is a no-op.
 * Error-safe: always resets the lock via try/finally.
 */
export async function runSchedulerTick(): Promise<void> {
  if (isSchedulerRunning) return;
  isSchedulerRunning = true;
  try {
    // Global housekeeping: runs once per tick, not per-owner
    runGlobalHousekeeping();

    const owners = getActiveOwnerKeys();
    for (const ownerKey of owners) {
      const config = getHeartbeatConfig(ownerKey);
      if (!config.enabled) continue;

      const tz = config.timezone;
      const localHour = getLocalHour(tz);
      const dayOfWeek = getLocalDayOfWeek(tz); // 0=Sunday
      // Capture ownerDay at enqueue time — handlers use this to record the correct
      // day/week even if job execution is delayed past midnight.
      const ownerDay = computeOwnerDay(tz);

      // LIGHT: catch-up — if hour >= 3 and hasn't run today
      // Deterministic housekeeping only, no LLM cost
      if (localHour >= 3 && !hasRunToday(ownerKey, "light", tz)) {
        enqueueJob("heartbeat_light", { ownerKey, ownerDay });
      }

      // DEEP: Sunday catch-up — if Sunday, hour >= 3, hasn't run this week
      // Gated: only if owner has enough facts to justify LLM analysis
      if (dayOfWeek === 0 && localHour >= 3 && !hasRunThisWeek(ownerKey, tz)) {
        if (hasEnoughFactsForDeep(ownerKey)) {
          enqueueJob("heartbeat_deep", { ownerKey, ownerDay });
        }
      }

      // DEEP recovery: Monday before noon — if previous week's deep was missed
      // AND no deep has run in the current week yet (prevents re-enqueue every tick)
      if (dayOfWeek === 1 && localHour < 12 && !hasRunThisWeek(ownerKey, tz)) {
        const currentWeek = computeOwnerWeek(tz);
        const prevWeek = getPreviousWeek(currentWeek);
        if (!hasRunInWeek(ownerKey, prevWeek, tz)) {
          if (hasEnoughFactsForDeep(ownerKey)) {
            enqueueJob("heartbeat_deep", { ownerKey, ownerDay });
          }
        }
      }
    }

    // === CONNECTOR SYNC LOOP ===
    // Discover connector-only owners (who have connectors but may not be in heartbeat loop)
    const connectorOwnerRows = sqlite
      .prepare(
        `SELECT DISTINCT owner_key FROM connectors WHERE status IN ('connected','error') AND enabled = 1`,
      )
      .all() as Array<{ owner_key: string }>;
    const allConnectorOwnerKeys = [
      ...new Set([
        ...owners,
        ...connectorOwnerRows.map((r) => r.owner_key),
      ]),
    ];

    for (const ownerKey of allConnectorOwnerKeys) {
      const activeConns = getActiveConnectors(ownerKey);
      if (activeConns.length === 0) continue;

      // Per-connector once-per-day guard using owner's timezone
      const tz = getHeartbeatConfig(ownerKey).timezone;
      const ownerToday = computeOwnerDay(tz);
      const allSyncedToday = activeConns.every((c) => {
        if (!c.lastSync) return false;
        const lastSyncDay = computeOwnerDay(tz, new Date(c.lastSync));
        return lastSyncDay === ownerToday;
      });
      if (allSyncedToday) continue;

      // Concurrency guard: enqueueJob uses dedup index (onConflictDoNothing)
      enqueueJob("connector_sync", { ownerKey, ownerDay: computeOwnerDay(tz) });
    }
  } finally {
    isSchedulerRunning = false;
  }
}
