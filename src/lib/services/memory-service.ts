import { eq, and, sql, desc } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, sqlite } from "@/lib/db";
import { agentMemory } from "@/lib/db/schema";
import { randomUUID } from "crypto";

const MAX_MEMORIES_PER_OWNER = 50;
const COOLDOWN_WINDOW_SECONDS = 60;
const MAX_WRITES_IN_COOLDOWN = 5;

export type MemoryType = "observation" | "preference" | "insight" | "pattern";
export type MemoryFeedback = "helpful" | "wrong";

export type MemoryRow = {
  id: string;
  ownerKey: string;
  content: string;
  memoryType: MemoryType;
  category: string | null;
  confidence: number | null;
  isActive: number;
  userFeedback: string | null;
  createdAt: string | null;
  contentHash?: string | null;
  deactivatedAt?: string | null;
  source?: string;
};

function computeContentHash(content: string): string {
  return createHash("sha256").update(content.trim().toLowerCase()).digest("hex");
}

/**
 * Save a new memory. Returns null if deduped, over quota, or in cooldown.
 */
export function saveMemory(
  ownerKey: string,
  content: string,
  memoryType: MemoryType = "observation",
  category?: string,
  confidence?: number,
): MemoryRow | null {
  const contentHash = computeContentHash(content);

  // Dedup: check for existing active memory with same hash
  const existing = db
    .select({ id: agentMemory.id })
    .from(agentMemory)
    .where(
      and(
        eq(agentMemory.ownerKey, ownerKey),
        eq(agentMemory.contentHash, contentHash),
        eq(agentMemory.isActive, 1),
      ),
    )
    .get();
  if (existing) return null;

  // Cooldown: count recent agent-sourced writes only (worker writes excluded)
  const recentCount = sqlite
    .prepare(
      `SELECT COUNT(*) as cnt FROM agent_memory
       WHERE owner_key = ? AND COALESCE(source, 'agent') = 'agent'
       AND created_at > datetime('now', '-${COOLDOWN_WINDOW_SECONDS} seconds')`,
    )
    .get(ownerKey) as { cnt: number };
  if (recentCount.cnt >= MAX_WRITES_IN_COOLDOWN) return null;

  // Quota: count active memories
  const activeCount = db
    .select({ count: sql<number>`count(*)` })
    .from(agentMemory)
    .where(and(eq(agentMemory.ownerKey, ownerKey), eq(agentMemory.isActive, 1)))
    .get();
  if ((activeCount?.count ?? 0) >= MAX_MEMORIES_PER_OWNER) return null;

  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(agentMemory)
    .values({
      id,
      ownerKey,
      content,
      memoryType,
      category: category ?? null,
      contentHash,
      confidence: confidence ?? 1.0,
      isActive: 1,
      source: "agent",
      createdAt: now,
    })
    .run();

  return {
    id,
    ownerKey,
    content,
    memoryType,
    category: category ?? null,
    confidence: confidence ?? 1.0,
    isActive: 1,
    userFeedback: null,
    createdAt: now,
    source: "agent",
  };
}

/**
 * Save a meta-memory from the background worker.
 * No per-minute cooldown (worker runs infrequently).
 * Same 50 max quota and content-hash dedup.
 * Provenance: source = "worker".
 */
export function saveMemoryFromWorker(
  ownerKey: string,
  content: string,
  memoryType?: MemoryType,
  category?: string,
  confidence?: number,
): MemoryRow | null {
  const hash = computeContentHash(content);

  // Dedup: same content already active?
  const existing = db
    .select()
    .from(agentMemory)
    .where(
      and(
        eq(agentMemory.ownerKey, ownerKey),
        eq(agentMemory.contentHash, hash),
        eq(agentMemory.isActive, 1),
      ),
    )
    .get();
  if (existing) return null;

  // Quota check (no cooldown — worker runs infrequently)
  const activeCount = db
    .select({ count: sql<number>`count(*)` })
    .from(agentMemory)
    .where(and(eq(agentMemory.ownerKey, ownerKey), eq(agentMemory.isActive, 1)))
    .get();
  if ((activeCount?.count ?? 0) >= MAX_MEMORIES_PER_OWNER) return null;

  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO agent_memory (id, owner_key, content, memory_type, category, content_hash, confidence, is_active, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'worker', ?)`,
    )
    .run(id, ownerKey, content, memoryType ?? "pattern", category ?? null, hash, confidence ?? 0.8, now);

  return {
    id,
    ownerKey,
    content,
    memoryType: memoryType ?? "pattern",
    category: category ?? null,
    confidence: confidence ?? 0.8,
    contentHash: hash,
    isActive: 1,
    userFeedback: null,
    deactivatedAt: null,
    createdAt: now,
    source: "worker",
  };
}

/**
 * Get active memories for an owner (ordered by recency, limited).
 */
export function getActiveMemories(ownerKey: string, limit: number = 20): MemoryRow[] {
  return db
    .select()
    .from(agentMemory)
    .where(and(eq(agentMemory.ownerKey, ownerKey), eq(agentMemory.isActive, 1)))
    .orderBy(desc(agentMemory.createdAt))
    .limit(limit)
    .all() as MemoryRow[];
}

/**
 * Apply user feedback to a memory.
 * - "helpful" → confidence +0.1 (cap 1.0)
 * - "wrong" → deactivate immediately
 */
export function feedbackMemory(
  memoryId: string,
  ownerKey: string,
  feedback: MemoryFeedback,
): boolean {
  const existing = db
    .select()
    .from(agentMemory)
    .where(
      and(
        eq(agentMemory.id, memoryId),
        eq(agentMemory.ownerKey, ownerKey),
        eq(agentMemory.isActive, 1),
      ),
    )
    .get();

  if (!existing) return false;

  if (feedback === "wrong") {
    db.update(agentMemory)
      .set({
        userFeedback: "wrong",
        isActive: 0,
        deactivatedAt: new Date().toISOString(),
      })
      .where(eq(agentMemory.id, memoryId))
      .run();
  } else {
    const newConfidence = Math.min((existing.confidence ?? 1.0) + 0.1, 1.0);
    db.update(agentMemory)
      .set({
        userFeedback: "helpful",
        confidence: newConfidence,
      })
      .where(eq(agentMemory.id, memoryId))
      .run();
  }

  return true;
}

/**
 * Deactivate a memory (soft delete).
 */
export function deactivateMemory(memoryId: string, ownerKey: string): boolean {
  const result = db
    .update(agentMemory)
    .set({
      isActive: 0,
      deactivatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(agentMemory.id, memoryId),
        eq(agentMemory.ownerKey, ownerKey),
        eq(agentMemory.isActive, 1),
      ),
    )
    .run();

  return result.changes > 0;
}

/**
 * Reactivate a deactivated memory.
 */
export function reactivateMemory(memoryId: string, ownerKey: string): boolean {
  const result = db
    .update(agentMemory)
    .set({
      isActive: 1,
      deactivatedAt: null,
    })
    .where(
      and(
        eq(agentMemory.id, memoryId),
        eq(agentMemory.ownerKey, ownerKey),
        eq(agentMemory.isActive, 0),
      ),
    )
    .run();

  return result.changes > 0;
}
