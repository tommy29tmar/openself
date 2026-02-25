import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { heartbeatRuns } from "@/lib/db/schema";
import {
  getHeartbeatConfig,
  computeOwnerDay,
  checkOwnerBudget,
} from "@/lib/services/heartbeat-config-service";
import { checkBudget } from "@/lib/services/usage-service";
import { expireStaleProposals } from "@/lib/services/soul-service";
import { logEvent } from "@/lib/services/event-service";

type HeartbeatPayload = {
  ownerKey: string;
};

/**
 * Light heartbeat (daily): KB freshness, page staleness, expire proposals.
 */
export function handleHeartbeatLight(payload: Record<string, unknown>): void {
  const { ownerKey } = payload as HeartbeatPayload;
  if (!ownerKey) throw new Error("heartbeat_light: missing ownerKey");

  const startMs = Date.now();
  const config = getHeartbeatConfig(ownerKey);

  // Global budget check
  const globalBudget = checkBudget();
  if (!globalBudget.allowed) {
    recordHeartbeatRun(ownerKey, "light", "budget_exceeded", 0, config.timezone, startMs);
    return;
  }

  // Per-owner budget check
  const ownerBudget = checkOwnerBudget(ownerKey, "light", config);
  if (!ownerBudget.allowed) {
    recordHeartbeatRun(ownerKey, "light", "budget_exceeded", 0, config.timezone, startMs);
    return;
  }

  // Expire stale soul proposals
  const expired = expireStaleProposals(48);

  const outcome = expired > 0 ? "action_taken" : "ok";
  recordHeartbeatRun(ownerKey, "light", outcome, 0, config.timezone, startMs);

  if (expired > 0) {
    logEvent({
      eventType: "heartbeat_action",
      actor: "worker",
      payload: { ownerKey, action: "expire_proposals", expired },
    });
  }
}

/**
 * Deep heartbeat (weekly): cross-section coherence, soul review, conflict cleanup.
 */
export function handleHeartbeatDeep(payload: Record<string, unknown>): void {
  const { ownerKey } = payload as HeartbeatPayload;
  if (!ownerKey) throw new Error("heartbeat_deep: missing ownerKey");

  const startMs = Date.now();
  const config = getHeartbeatConfig(ownerKey);

  // Global budget check
  const globalBudget = checkBudget();
  if (!globalBudget.allowed) {
    recordHeartbeatRun(ownerKey, "deep", "budget_exceeded", 0, config.timezone, startMs);
    return;
  }

  // Per-owner budget check
  const ownerBudget = checkOwnerBudget(ownerKey, "deep", config);
  if (!ownerBudget.allowed) {
    recordHeartbeatRun(ownerKey, "deep", "budget_exceeded", 0, config.timezone, startMs);
    return;
  }

  // For now, deep heartbeat just expires proposals and dismisses old conflicts
  const expired = expireStaleProposals(48);

  // Dismiss conflicts older than 7 days
  const dismissed = dismissOldConflicts(ownerKey, 7);

  const outcome = expired > 0 || dismissed > 0 ? "action_taken" : "ok";
  recordHeartbeatRun(ownerKey, "deep", outcome, 0, config.timezone, startMs);
}

function dismissOldConflicts(ownerKey: string, days: number): number {
  const { sqlite } = require("@/lib/db");
  const result = sqlite
    .prepare(
      `UPDATE fact_conflicts SET status = 'dismissed', resolved_at = datetime('now')
       WHERE owner_key = ? AND status = 'open' AND created_at < datetime('now', '-${days} days')`,
    )
    .run(ownerKey);
  return result.changes;
}

function recordHeartbeatRun(
  ownerKey: string,
  runType: "light" | "deep",
  outcome: string,
  estimatedCostUsd: number,
  timezone: string,
  startMs: number,
): void {
  const durationMs = Date.now() - startMs;
  const ownerDay = computeOwnerDay(timezone);

  db.insert(heartbeatRuns)
    .values({
      id: randomUUID(),
      ownerKey,
      runType,
      ownerDay,
      outcome,
      estimatedCostUsd,
      durationMs,
    })
    .run();
}
