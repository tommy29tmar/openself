/**
 * Heartbeat scheduler — auto-enqueues heartbeat_light (daily) and heartbeat_deep (weekly).
 *
 * Runs as a periodic tick inside the worker process. Each tick checks all active owners
 * and enqueues jobs based on their local timezone:
 * - Light: daily at/after 3 AM local time (catch-up) — deterministic housekeeping, no LLM
 * - Deep: Sunday at/after 3 AM local time (catch-up) — LLM-dependent, gated by minimum fact count
 * - Deep recovery: Monday before noon if previous week's deep was missed
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
import { DEEP_HEARTBEAT_MIN_FACTS } from "@/lib/agent/thresholds";
import { runGlobalHousekeeping } from "@/lib/worker/heartbeat";
import { getActiveFacts } from "@/lib/services/kb-service";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";

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
  } finally {
    isSchedulerRunning = false;
  }
}
