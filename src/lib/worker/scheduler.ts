/**
 * Heartbeat scheduler — auto-enqueues heartbeat_light (daily) and heartbeat_deep (weekly).
 *
 * Runs as a periodic tick inside the worker process. Each tick checks all active owners
 * and enqueues jobs based on their local timezone:
 * - Light: daily at/after 3 AM local time (catch-up)
 * - Deep: Sunday at/after 3 AM local time (catch-up)
 * - Deep recovery: Monday before noon if previous week's deep was missed
 */

import {
  getActiveOwnerKeys,
  getHeartbeatConfig,
  hasRunToday,
  hasRunThisWeek,
  hasRunInWeek,
  computeOwnerWeek,
  getPreviousWeek,
} from "@/lib/services/heartbeat-config-service";
import { enqueueJob } from "@/lib/worker/index";

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
 * Single scheduler tick. Iterates all active owners and enqueues due heartbeat jobs.
 *
 * Anti-overlap: if a previous tick is still running, this call is a no-op.
 * Error-safe: always resets the lock via try/finally.
 */
export async function runSchedulerTick(): Promise<void> {
  if (isSchedulerRunning) return;
  isSchedulerRunning = true;
  try {
    const owners = getActiveOwnerKeys();
    for (const ownerKey of owners) {
      const config = getHeartbeatConfig(ownerKey);
      if (!config.enabled) continue;

      const tz = config.timezone;
      const localHour = getLocalHour(tz);
      const dayOfWeek = getLocalDayOfWeek(tz); // 0=Sunday

      // LIGHT: catch-up — if hour >= 3 and hasn't run today
      if (localHour >= 3 && !hasRunToday(ownerKey, "light", tz)) {
        enqueueJob("heartbeat_light", { ownerKey });
      }

      // DEEP: Sunday catch-up — if Sunday, hour >= 3, hasn't run this week
      if (dayOfWeek === 0 && localHour >= 3 && !hasRunThisWeek(ownerKey, tz)) {
        enqueueJob("heartbeat_deep", { ownerKey });
      }

      // DEEP recovery: Monday before noon — if previous week's deep was missed
      if (dayOfWeek === 1 && localHour < 12) {
        const currentWeek = computeOwnerWeek(tz);
        const prevWeek = getPreviousWeek(currentWeek);
        if (!hasRunInWeek(ownerKey, prevWeek, tz)) {
          enqueueJob("heartbeat_deep", { ownerKey });
        }
      }
    }
  } finally {
    isSchedulerRunning = false;
  }
}
