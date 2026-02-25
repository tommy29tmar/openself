/**
 * Tests for Sub-Phase 3: memory-service (saveMemory, getActiveMemories, feedbackMemory, deactivateMemory, reactivateMemory).
 * Uses the real SQLite DB (auto-created + migrated on import).
 */
import { describe, it, expect, afterAll } from "vitest";
import {
  saveMemory,
  getActiveMemories,
  feedbackMemory,
  deactivateMemory,
  reactivateMemory,
} from "@/lib/services/memory-service";
import { db, sqlite } from "@/lib/db";
import { agentMemory } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

/** Unique owner per test to avoid cross-test contamination. */
function uniqueOwner() {
  return `test-memory-${randomUUID()}`;
}

afterAll(() => {
  // Clean up all test rows created during the run
  sqlite
    .prepare("DELETE FROM agent_memory WHERE owner_key LIKE 'test-memory-%'")
    .run();
});

// ---------------------------------------------------------------------------
// 1. saveMemory creates a new memory with correct fields
// ---------------------------------------------------------------------------
describe("saveMemory", () => {
  it("creates a new memory with correct fields", () => {
    const owner = uniqueOwner();
    const mem = saveMemory(owner, "User likes dark themes", "preference", "ui", 0.9);

    expect(mem).not.toBeNull();
    expect(mem!.id).toBeTruthy();
    expect(mem!.ownerKey).toBe(owner);
    expect(mem!.content).toBe("User likes dark themes");
    expect(mem!.memoryType).toBe("preference");
    expect(mem!.category).toBe("ui");
    expect(mem!.confidence).toBe(0.9);
    expect(mem!.isActive).toBe(1);
    expect(mem!.createdAt).toBeTruthy();
  });

  // 2. Duplicate content returns null (dedup by content hash)
  it("returns null for duplicate content (same content hash)", () => {
    const owner = uniqueOwner();
    const first = saveMemory(owner, "Loves TypeScript");
    expect(first).not.toBeNull();

    const dupe = saveMemory(owner, "Loves TypeScript");
    expect(dupe).toBeNull();
  });

  // 3. Different content does not trigger dedup
  it("saves different content without false dedup", () => {
    const owner = uniqueOwner();
    const a = saveMemory(owner, "Fact A");
    const b = saveMemory(owner, "Fact B");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.id).not.toBe(b!.id);
  });
});

// ---------------------------------------------------------------------------
// 4-6. getActiveMemories
// ---------------------------------------------------------------------------
describe("getActiveMemories", () => {
  it("returns only active memories ordered by recency", () => {
    const owner = uniqueOwner();
    const m1 = saveMemory(owner, "First memory");
    const m2 = saveMemory(owner, "Second memory");
    const m3 = saveMemory(owner, "Third memory");

    // Deactivate m2 so it should not appear
    deactivateMemory(m2!.id, owner);

    const active = getActiveMemories(owner);
    expect(active).toHaveLength(2);
    // Most recent first
    expect(active[0].id).toBe(m3!.id);
    expect(active[1].id).toBe(m1!.id);
  });

  // 5. limit parameter works
  it("respects the limit parameter", () => {
    const owner = uniqueOwner();
    saveMemory(owner, "Mem 1");
    saveMemory(owner, "Mem 2");
    saveMemory(owner, "Mem 3");

    const limited = getActiveMemories(owner, 2);
    expect(limited).toHaveLength(2);
  });

  // 6. Owner isolation
  it("does not return memories from a different owner", () => {
    const ownerA = uniqueOwner();
    const ownerB = uniqueOwner();

    saveMemory(ownerA, "Owner A memory");
    saveMemory(ownerB, "Owner B memory");

    const aMemories = getActiveMemories(ownerA);
    expect(aMemories).toHaveLength(1);
    expect(aMemories[0].content).toBe("Owner A memory");

    const bMemories = getActiveMemories(ownerB);
    expect(bMemories).toHaveLength(1);
    expect(bMemories[0].content).toBe("Owner B memory");
  });
});

// ---------------------------------------------------------------------------
// 7-9. feedbackMemory
// ---------------------------------------------------------------------------
describe("feedbackMemory", () => {
  // 7. "helpful" increases confidence by 0.1, capped at 1.0
  it('"helpful" increases confidence by 0.1 (capped at 1.0)', () => {
    const owner = uniqueOwner();
    const mem = saveMemory(owner, "Some insight", "insight", undefined, 0.8);
    expect(mem).not.toBeNull();

    const ok = feedbackMemory(mem!.id, owner, "helpful");
    expect(ok).toBe(true);

    const active = getActiveMemories(owner);
    const updated = active.find((m) => m.id === mem!.id);
    expect(updated).toBeTruthy();
    expect(updated!.confidence).toBeCloseTo(0.9, 5);

    // Push to 1.0 and verify cap
    feedbackMemory(mem!.id, owner, "helpful"); // -> 1.0
    feedbackMemory(mem!.id, owner, "helpful"); // -> still 1.0

    const afterCap = getActiveMemories(owner).find((m) => m.id === mem!.id);
    expect(afterCap!.confidence).toBe(1.0);
  });

  // 8. "wrong" deactivates the memory
  it('"wrong" deactivates the memory (isActive=0)', () => {
    const owner = uniqueOwner();
    const mem = saveMemory(owner, "Incorrect fact", "observation");
    expect(mem).not.toBeNull();

    const ok = feedbackMemory(mem!.id, owner, "wrong");
    expect(ok).toBe(true);

    // Should no longer appear in active memories
    const active = getActiveMemories(owner);
    expect(active.find((m) => m.id === mem!.id)).toBeUndefined();

    // Verify DB row directly
    const row = db
      .select()
      .from(agentMemory)
      .where(eq(agentMemory.id, mem!.id))
      .get() as any;
    expect(row.isActive).toBe(0);
    expect(row.deactivatedAt).toBeTruthy();
    expect(row.userFeedback).toBe("wrong");
  });

  // 9. Returns false for nonexistent memory
  it("returns false for nonexistent memory", () => {
    const owner = uniqueOwner();
    const result = feedbackMemory("nonexistent-id", owner, "helpful");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10-11. deactivateMemory / reactivateMemory
// ---------------------------------------------------------------------------
describe("deactivateMemory", () => {
  it("sets isActive=0 and deactivatedAt", () => {
    const owner = uniqueOwner();
    const mem = saveMemory(owner, "Will be deactivated");
    expect(mem).not.toBeNull();

    const ok = deactivateMemory(mem!.id, owner);
    expect(ok).toBe(true);

    const row = db
      .select()
      .from(agentMemory)
      .where(eq(agentMemory.id, mem!.id))
      .get() as any;
    expect(row.isActive).toBe(0);
    expect(row.deactivatedAt).toBeTruthy();
  });

  it("returns false when already deactivated", () => {
    const owner = uniqueOwner();
    const mem = saveMemory(owner, "Double deactivate test");
    deactivateMemory(mem!.id, owner);

    const second = deactivateMemory(mem!.id, owner);
    expect(second).toBe(false);
  });
});

describe("reactivateMemory", () => {
  it("sets isActive=1 and deactivatedAt=null", () => {
    const owner = uniqueOwner();
    const mem = saveMemory(owner, "Will be reactivated");
    deactivateMemory(mem!.id, owner);

    const ok = reactivateMemory(mem!.id, owner);
    expect(ok).toBe(true);

    const row = db
      .select()
      .from(agentMemory)
      .where(eq(agentMemory.id, mem!.id))
      .get() as any;
    expect(row.isActive).toBe(1);
    expect(row.deactivatedAt).toBeNull();
  });

  it("returns false when already active", () => {
    const owner = uniqueOwner();
    const mem = saveMemory(owner, "Already active");

    const result = reactivateMemory(mem!.id, owner);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12. Memory quota: after MAX_MEMORIES_PER_OWNER (50), saveMemory returns null
// ---------------------------------------------------------------------------
describe("memory quota", () => {
  it("rejects save after 50 active memories", () => {
    const owner = uniqueOwner();
    const now = new Date().toISOString();

    // Bulk-insert 50 memories via direct SQL to be fast
    const insert = sqlite.prepare(
      `INSERT INTO agent_memory (id, owner_key, content, memory_type, content_hash, confidence, is_active, created_at)
       VALUES (?, ?, ?, 'observation', ?, 1.0, 1, ?)`,
    );
    const txn = sqlite.transaction(() => {
      for (let i = 0; i < 50; i++) {
        const id = randomUUID();
        insert.run(id, owner, `quota-memory-${i}`, `hash-quota-${owner}-${i}`, now);
      }
    });
    txn();

    // Verify 50 active
    const active = getActiveMemories(owner, 100);
    expect(active).toHaveLength(50);

    // 51st should be rejected
    const rejected = saveMemory(owner, "One too many");
    expect(rejected).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 13. Cooldown: after 5 rapid saves, 6th returns null
// ---------------------------------------------------------------------------
describe("cooldown", () => {
  it("rejects 6th rapid save within the cooldown window", () => {
    const owner = uniqueOwner();

    // Save 5 memories rapidly (all within 1 second, well inside the 60s window)
    for (let i = 1; i <= 5; i++) {
      const result = saveMemory(owner, `rapid-${i}`);
      expect(result).not.toBeNull();
    }

    // 6th should be rejected by cooldown
    const rejected = saveMemory(owner, "sixth rapid save");
    expect(rejected).toBeNull();
  });
});
