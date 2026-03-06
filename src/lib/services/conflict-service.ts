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

export type ConflictResolution = "keep_a" | "keep_b" | "merge" | "dismissed";
type FactSnapshot = typeof facts.$inferSelect;
type ConflictReverseOp =
  | { action: "restore"; factId: string; previousValue: unknown }
  | {
      action: "recreate";
      factId: string;
      previousFact: Record<string, unknown>;
    };

function getFactSnapshot(factId: string): FactSnapshot | undefined {
  return db
    .select()
    .from(facts)
    .where(eq(facts.id, factId))
    .get() as FactSnapshot | undefined;
}

function buildRecreateOp(fact: FactSnapshot | undefined): ConflictReverseOp | null {
  if (!fact) return null;
  const { id, ...rest } = fact;
  return {
    action: "recreate",
    factId: id,
    previousFact: rest as Record<string, unknown>,
  };
}

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
  resolution: ConflictResolution,
  mergedValue?: Record<string, unknown>,
): { success: boolean; error?: string } {
  if (resolution === "merge" && !mergedValue) {
    return { success: false, error: "mergedValue is required for merge resolution" };
  }

  return sqlite.transaction(() => {
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
    const reverseOps: ConflictReverseOp[] = [];
    const factA = getFactSnapshot(conflict.factAId);
    const factB = conflict.factBId ? getFactSnapshot(conflict.factBId) : undefined;

    // Apply resolution and capture the inverse operation for trust-ledger undo.
    if (resolution === "keep_a" && conflict.factBId) {
      const recreateFactB = buildRecreateOp(factB);
      if (recreateFactB) reverseOps.push(recreateFactB);
      sqlite.prepare("DELETE FROM facts WHERE id = ?").run(conflict.factBId);
    } else if (resolution === "keep_b") {
      const recreateFactA = buildRecreateOp(factA);
      if (recreateFactA) reverseOps.push(recreateFactA);
      sqlite.prepare("DELETE FROM facts WHERE id = ?").run(conflict.factAId);
    } else if (resolution === "merge" && mergedValue) {
      if (factA) {
        reverseOps.push({
          action: "restore",
          factId: factA.id,
          previousValue: factA.value,
        });
      }
      sqlite
        .prepare("UPDATE facts SET value = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(mergedValue), now, conflict.factAId);
      if (conflict.factBId) {
        const recreateFactB = buildRecreateOp(factB);
        if (recreateFactB) reverseOps.push(recreateFactB);
        sqlite.prepare("DELETE FROM facts WHERE id = ?").run(conflict.factBId);
      }
    }

    sqlite
      .prepare(
        "UPDATE fact_conflicts SET status = ?, resolution = ?, resolved_at = ? WHERE id = ?",
      )
      .run(
        resolution === "dismissed" ? "dismissed" : "resolved",
        resolution,
        now,
        conflictId,
      );

    logTrustAction(
      ownerKey,
      "conflict_resolved",
      `Resolved conflict: ${resolution}`,
      {
        entityId: conflictId,
        details: { resolution, category: conflict.category, key: conflict.key },
        undoPayload: {
          action: "undo_conflict_resolution",
          conflictId,
          reverseOps,
        },
      },
    );

    return { success: true };
  })();
}
