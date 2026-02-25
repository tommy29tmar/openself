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
