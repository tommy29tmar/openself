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

const PROVENANCE_WEIGHT = { agent: 1.0, worker: 0.6 } as const;
const RECENCY_HALF_LIFE_DAYS = 14;

/**
 * Relevance-scored retrieval: recency × provenance_weight.
 * Replaces flat getActiveMemories(ownerKey, 10) for context injection.
 */
export function getActiveMemoriesScored(ownerKey: string, limit: number = 15): MemoryRow[] {
  const rows = sqlite
    .prepare(
      `SELECT id, owner_key, content, memory_type, category, content_hash,
              confidence, is_active, user_feedback, deactivated_at, created_at,
              COALESCE(source, 'agent') AS source,
              julianday('now') - julianday(created_at) AS age_days
       FROM agent_memory
       WHERE owner_key = ? AND is_active = 1
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all(ownerKey) as Array<{
      id: string; owner_key: string; content: string; memory_type: string;
      category: string | null; content_hash: string | null; confidence: number | null;
      is_active: number; user_feedback: string | null; deactivated_at: string | null;
      created_at: string | null; source: string; age_days: number;
    }>;

  const scored = rows.map((row) => {
    const ageDays = row.age_days ?? 0;
    const recencyScore = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
    const provenanceScore =
      PROVENANCE_WEIGHT[row.source as keyof typeof PROVENANCE_WEIGHT] ?? 0.6;
    const mem: MemoryRow & { score: number } = {
      id: row.id,
      ownerKey: row.owner_key,
      content: row.content,
      memoryType: row.memory_type as MemoryType,
      category: row.category,
      contentHash: row.content_hash,
      confidence: row.confidence,
      isActive: row.is_active,
      userFeedback: row.user_feedback,
      deactivatedAt: row.deactivated_at,
      createdAt: row.created_at,
      source: row.source,
      score: recencyScore * provenanceScore,
    };
    return mem;
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
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
