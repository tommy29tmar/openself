import { eq, and, desc } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import { trustLedger, facts as factsTable } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { deactivateMemory, reactivateMemory, feedbackMemory } from "@/lib/services/memory-service";

export type TrustEntry = {
  id: string;
  ownerKey: string;
  actionType: string;
  summary: string;
  entityId: string | null;
  details: unknown;
  undoPayload: unknown;
  reversed: number;
  reversedAt: string | null;
  createdAt: string | null;
};

type UndoPayload = {
  action: string;
  [key: string]: unknown;
};

/**
 * Log a trust action. Must include undo_payload at write time for reversibility.
 */
export function logTrustAction(
  ownerKey: string,
  actionType: string,
  summary: string,
  opts: {
    entityId?: string;
    details?: Record<string, unknown>;
    undoPayload?: UndoPayload;
  } = {},
): string {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(trustLedger)
    .values({
      id,
      ownerKey,
      actionType,
      summary,
      entityId: opts.entityId ?? null,
      details: opts.details ?? {},
      undoPayload: opts.undoPayload ?? null,
      reversed: 0,
      createdAt: now,
    })
    .run();

  return id;
}

/**
 * Get the trust ledger for an owner (most recent first).
 */
export function getTrustLedger(ownerKey: string, limit: number = 20): TrustEntry[] {
  return db
    .select()
    .from(trustLedger)
    .where(eq(trustLedger.ownerKey, ownerKey))
    .orderBy(desc(trustLedger.createdAt))
    .limit(limit)
    .all() as TrustEntry[];
}

/**
 * Execute an undo action based on its payload.
 */
function executeUndo(payload: UndoPayload, ownerKey: string): void {
  switch (payload.action) {
    case "deactivate_memory":
      deactivateMemory(payload.memoryId as string, ownerKey);
      break;
    case "reactivate_memory":
      reactivateMemory(payload.memoryId as string, ownerKey);
      break;
    case "reset_feedback":
      // Reset feedback by re-applying null (handled by update)
      if (payload.memoryId) {
        sqlite
          .prepare(
            "UPDATE agent_memory SET user_feedback = NULL WHERE id = ? AND owner_key = ?",
          )
          .run(payload.memoryId, ownerKey);
      }
      break;
    case "reopen_conflict":
      if (payload.conflictId) {
        sqlite
          .prepare(
            "UPDATE fact_conflicts SET status = 'open', resolved_at = NULL WHERE id = ? AND owner_key = ?",
          )
          .run(payload.conflictId, ownerKey);
      }
      break;
    case "unarchive_fact":
      // Undo an archive — caller must trigger recomposeAfterMutation() after
      sqlite
        .prepare(
          "UPDATE facts SET archived_at = NULL, updated_at = ? WHERE id = ?",
        )
        .run(new Date().toISOString(), payload.factId as string);
      break;
    case "reverse_batch": {
      // Undo batch_facts: each reverseOp reverses one sub-operation
      //   create → { action: "delete", factId }
      //   update → { action: "restore", factId, previousValue }
      //   delete → { action: "recreate", factId, previousFact }
      // NOTE (R7-C2): caller must trigger recomposeAfterMutation() after
      const reverseOps = (payload.reverseOps ?? []) as Array<{
        action: "delete" | "restore" | "recreate";
        factId?: string;
        previousValue?: unknown;
        previousFact?: Record<string, unknown>;
      }>;
      for (const op of reverseOps) {
        switch (op.action) {
          case "delete":
            db.delete(factsTable).where(eq(factsTable.id, op.factId!)).run();
            break;
          case "restore":
            db.update(factsTable)
              .set({ value: op.previousValue as string, updatedAt: new Date().toISOString() })
              .where(eq(factsTable.id, op.factId!))
              .run();
            break;
          case "recreate":
            if (op.previousFact) {
              db.insert(factsTable)
                .values({ id: op.factId, ...op.previousFact } as any)
                .onConflictDoNothing()
                .run();
            }
            break;
        }
      }
      break;
    }
    default:
      throw new Error(`Unknown undo action: ${payload.action}`);
  }
}

/**
 * Reverse a trust action. Transactional CAS — no double-undo, no partial commit.
 */
export function reverseTrustAction(entryId: string, ownerKey: string): boolean {
  return sqlite.transaction(() => {
    // 1. Read and validate BEFORE any mutation
    const entry = sqlite
      .prepare(
        "SELECT undo_payload, reversed FROM trust_ledger WHERE id = ? AND owner_key = ?",
      )
      .get(entryId, ownerKey) as
      | { undo_payload: string | null; reversed: number }
      | undefined;

    if (!entry || entry.reversed === 1) return false;
    if (!entry.undo_payload) {
      throw new Error(`Trust entry ${entryId} has no undo_payload — not reversible`);
    }

    // 2. CAS claim (reversed=0 → 1)
    const result = sqlite
      .prepare(
        "UPDATE trust_ledger SET reversed = 1, reversed_at = datetime('now') WHERE id = ? AND owner_key = ? AND reversed = 0",
      )
      .run(entryId, ownerKey);
    if (result.changes !== 1) return false;

    // 3. Execute undo — if this throws, transaction rolls back
    const payload = JSON.parse(entry.undo_payload) as UndoPayload;
    executeUndo(payload, ownerKey);
    return true;
  })();
}
