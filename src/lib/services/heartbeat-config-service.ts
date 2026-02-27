import { eq } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import { heartbeatConfig, heartbeatRuns } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export type HeartbeatConfigRow = {
  ownerKey: string;
  lightBudgetDailyUsd: number;
  deepBudgetDailyUsd: number;
  timezone: string;
  lightIntervalHours: number;
  deepIntervalHours: number;
  enabled: number;
};

/**
 * Get heartbeat config for an owner. Returns defaults if no row exists.
 */
export function getHeartbeatConfig(ownerKey: string): HeartbeatConfigRow {
  const row = db
    .select()
    .from(heartbeatConfig)
    .where(eq(heartbeatConfig.ownerKey, ownerKey))
    .get();

  return {
    ownerKey,
    lightBudgetDailyUsd: row?.lightBudgetDailyUsd ?? 0.1,
    deepBudgetDailyUsd: row?.deepBudgetDailyUsd ?? 0.25,
    timezone: row?.timezone ?? "UTC",
    lightIntervalHours: row?.lightIntervalHours ?? 24,
    deepIntervalHours: row?.deepIntervalHours ?? 168,
    enabled: row?.enabled ?? 1,
  };
}

/**
 * Compute the owner's local date string (DST-safe).
 */
export function computeOwnerDay(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC" }).format(
    new Date(),
  );
}

/**
 * Check per-owner daily budget for a run type.
 */
export function checkOwnerBudget(
  ownerKey: string,
  runType: "light" | "deep",
  config: HeartbeatConfigRow,
): { allowed: boolean; spent: number; limit: number } {
  const ownerDay = computeOwnerDay(config.timezone);
  const limit =
    runType === "light" ? config.lightBudgetDailyUsd : config.deepBudgetDailyUsd;

  const row = db
    .select({ total: sql<number>`COALESCE(SUM(estimated_cost_usd), 0)` })
    .from(heartbeatRuns)
    .where(
      sql`${heartbeatRuns.ownerKey} = ${ownerKey} AND ${heartbeatRuns.runType} = ${runType} AND ${heartbeatRuns.ownerDay} = ${ownerDay}`,
    )
    .get();

  const spent = row?.total ?? 0;
  return { allowed: spent < limit, spent, limit };
}

/**
 * Get all active owner keys: union of heartbeat_config (enabled) and distinct fact owners.
 */
export function getActiveOwnerKeys(): string[] {
  const rows = sqlite
    .prepare(
      `SELECT owner_key FROM heartbeat_config WHERE enabled = 1
       UNION
       SELECT DISTINCT COALESCE(profile_id, session_id) AS owner_key FROM facts
       WHERE COALESCE(profile_id, session_id) IS NOT NULL`,
    )
    .all() as { owner_key: string }[];

  return rows.map((r) => r.owner_key);
}

/**
 * Compute ISO week string (e.g. "2026-W09") in the owner's timezone.
 */
export function computeOwnerWeek(timezone: string): string {
  const tz = timezone || "UTC";
  const now = new Date();

  // Get local date parts in the owner's timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce(
      (acc, p) => {
        if (p.type === "year") acc.year = Number(p.value);
        if (p.type === "month") acc.month = Number(p.value);
        if (p.type === "day") acc.day = Number(p.value);
        return acc;
      },
      { year: 0, month: 0, day: 0 },
    );

  // Build a Date from local parts (treated as UTC for ISO week calculation)
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return isoWeekString(d);
}

/**
 * Compute ISO week string from a Date (interpreted as UTC).
 */
function isoWeekString(d: Date): string {
  // ISO week: week 1 contains the first Thursday of the year
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  const dayNum = tmp.getUTCDay() || 7; // Convert Sun=0 to 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Return the previous ISO week string (e.g. "2026-W09" → "2026-W08").
 * Handles year boundary (W01 → previous year's last week).
 */
export function getPreviousWeek(weekStr: string): string {
  const [yearStr, wStr] = weekStr.split("-W");
  const year = Number(yearStr);
  const week = Number(wStr);

  if (week > 1) {
    return `${year}-W${String(week - 1).padStart(2, "0")}`;
  }

  // Week 1 → find last week of previous year
  // Dec 28 always falls in the last ISO week of its year
  const dec28 = new Date(Date.UTC(year - 1, 11, 28));
  return isoWeekString(dec28);
}

/**
 * Check if a heartbeat run of the given type exists for today (owner timezone).
 */
export function hasRunToday(
  ownerKey: string,
  runType: "light" | "deep",
  timezone: string,
): boolean {
  const ownerDay = computeOwnerDay(timezone);
  const row = db
    .select({ id: heartbeatRuns.id })
    .from(heartbeatRuns)
    .where(
      sql`${heartbeatRuns.ownerKey} = ${ownerKey} AND ${heartbeatRuns.runType} = ${runType} AND ${heartbeatRuns.ownerDay} = ${ownerDay}`,
    )
    .limit(1)
    .get();
  return !!row;
}

/**
 * Check if a deep heartbeat run exists in the current ISO week (owner timezone).
 */
export function hasRunThisWeek(ownerKey: string, timezone: string): boolean {
  return hasRunInWeek(ownerKey, computeOwnerWeek(timezone), timezone);
}

/**
 * Check if a deep heartbeat run exists in a specific ISO week.
 * Scans heartbeat_runs for owner_day values that fall within the given week.
 */
export function hasRunInWeek(
  ownerKey: string,
  weekStr: string,
  _timezone: string,
): boolean {
  // Compute the Monday–Sunday date range for the ISO week
  const [yearStr, wStr] = weekStr.split("-W");
  const year = Number(yearStr);
  const week = Number(wStr);

  // Jan 4 is always in ISO week 1. Find Monday of week 1, then offset.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // Mon=1..Sun=7
  const mondayW1 = new Date(jan4.getTime() - (dayOfWeek - 1) * 86_400_000);
  const mondayTarget = new Date(mondayW1.getTime() + (week - 1) * 7 * 86_400_000);
  const sundayTarget = new Date(mondayTarget.getTime() + 6 * 86_400_000);

  const startDay = mondayTarget.toISOString().slice(0, 10); // YYYY-MM-DD
  const endDay = sundayTarget.toISOString().slice(0, 10);

  const row = db
    .select({ id: heartbeatRuns.id })
    .from(heartbeatRuns)
    .where(
      sql`${heartbeatRuns.ownerKey} = ${ownerKey} AND ${heartbeatRuns.runType} = 'deep' AND ${heartbeatRuns.ownerDay} >= ${startDay} AND ${heartbeatRuns.ownerDay} <= ${endDay}`,
    )
    .limit(1)
    .get();
  return !!row;
}
