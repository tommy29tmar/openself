import { eq, and } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import { factConflicts, facts } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { logTrustAction } from "@/lib/services/trust-ledger-service";

// Source precedence: higher wins
const SOURCE_PRECEDENCE: Record<string, number> = {
  user_explicit: 4,
  chat: 3,
  connector: 2,
  heartbeat: 1,
};

export type ConflictRow = {
  id: string;
  ownerKey: string;
  factAId: string;
  factBId: string | null;
  category: string;
  key: string;
  status: string;
  resolution: string | null;
  sourceA: string | null;
  sourceB: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
};

/**
 * Get open conflicts for an owner.
 */
export function getOpenConflicts(ownerKey: string): ConflictRow[] {
  return db
    .select()
    .from(factConflicts)
    .where(
      and(
        eq(factConflicts.ownerKey, ownerKey),
        eq(factConflicts.status, "open"),
      ),
    )
    .all() as ConflictRow[];
}

/**
 * Create a fact conflict if sources need user resolution.
 */
export function createConflict(
  ownerKey: string,
  factAId: string,
  factBId: string | null,
  category: string,
  key: string,
  sourceA: string,
  sourceB?: string,
): ConflictRow | null {
  // Auto-resolve if one source has clear precedence
  const precA = SOURCE_PRECEDENCE[sourceA] ?? 0;
  const precB = SOURCE_PRECEDENCE[sourceB ?? ""] ?? 0;

  if (precA > 0 && precB > 0 && Math.abs(precA - precB) >= 2) {
    // Clear precedence — no conflict needed
    return null;
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(factConflicts)
    .values({
      id,
      ownerKey,
      factAId,
      factBId: factBId ?? null,
      category,
      key,
      status: "open",
      sourceA,
      sourceB: sourceB ?? null,
      createdAt: now,
    })
    .run();

  return {
    id,
    ownerKey,
    factAId,
    factBId: factBId ?? null,
    category,
    key,
    status: "open",
    resolution: null,
    sourceA,
    sourceB: sourceB ?? null,
    createdAt: now,
    resolvedAt: null,
  };
}

/**
 * Resolve a conflict. Used by agent tool, user API, or auto-expire.
 */
export function resolveConflict(
  conflictId: string,
  ownerKey: string,
  resolution: "keep_a" | "keep_b" | "merge" | "dismissed",
  mergedValue?: Record<string, unknown>,
): { success: boolean; error?: string } {
  const conflict = db
    .select()
    .from(factConflicts)
    .where(
      and(
        eq(factConflicts.id, conflictId),
        eq(factConflicts.ownerKey, ownerKey),
        eq(factConflicts.status, "open"),
      ),
    )
    .get() as ConflictRow | undefined;

  if (!conflict) {
    return { success: false, error: "Conflict not found or already resolved" };
  }

  const now = new Date().toISOString();

  // Apply resolution
  if (resolution === "keep_a" && conflict.factBId) {
    // Delete fact B
    sqlite.prepare("DELETE FROM facts WHERE id = ?").run(conflict.factBId);
  } else if (resolution === "keep_b") {
    // Delete fact A
    sqlite.prepare("DELETE FROM facts WHERE id = ?").run(conflict.factAId);
  } else if (resolution === "merge" && mergedValue) {
    // Update fact A with merged value, delete fact B
    sqlite
      .prepare("UPDATE facts SET value = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(mergedValue), now, conflict.factAId);
    if (conflict.factBId) {
      sqlite.prepare("DELETE FROM facts WHERE id = ?").run(conflict.factBId);
    }
  }

  // Mark resolved
  sqlite
    .prepare(
      "UPDATE fact_conflicts SET status = ?, resolution = ?, resolved_at = ? WHERE id = ?",
    )
    .run(resolution === "dismissed" ? "dismissed" : "resolved", resolution, now, conflictId);

  // Trust ledger entry
  logTrustAction(ownerKey, "conflict_resolved", `Resolved conflict: ${resolution}`, {
    entityId: conflictId,
    details: { resolution, category: conflict.category, key: conflict.key },
    undoPayload: {
      action: "reopen_conflict",
      conflictId,
    },
  });

  return { success: true };
}
