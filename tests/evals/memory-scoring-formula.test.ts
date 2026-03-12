import { describe, it, expect, afterAll } from "vitest";
import { saveMemory, getActiveMemoriesScored } from "@/lib/services/memory-service";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

function uniqueOwner() { return `test-scoring-${randomUUID()}`; }

afterAll(() => {
  sqlite.prepare("DELETE FROM agent_memory WHERE owner_key LIKE 'test-scoring-%'").run();
});

describe("memory scoring formula", () => {
  it("should penalize never-referenced memories with 0.5 usageBoost", () => {
    const owner = uniqueOwner();
    saveMemory(owner, "Test memory A", "observation");

    const scored = getActiveMemoriesScored(owner, 10);
    expect(scored).toHaveLength(1);
    // Never referenced: usageBoost = 0.5
    // creationRecency ≈ 1.0 (just created), provenance = 1.0 (agent)
    // score ≈ 1.0 * 1.0 * 0.5 = 0.5
    expect(scored[0].score).toBeCloseTo(0.5, 1);
  });

  it("should boost recently-referenced memories", () => {
    const owner = uniqueOwner();
    const mem = saveMemory(owner, "Referenced memory", "observation");

    sqlite.prepare(
      "UPDATE agent_memory SET last_referenced_at = datetime('now') WHERE id = ?"
    ).run(mem!.id);

    const scored = getActiveMemoriesScored(owner, 10);
    // Referenced just now: usageBoost ≈ 1.0
    expect(scored[0].score).toBeGreaterThan(0.9);
  });

  it("should decay usage boost with 28-day half-life", () => {
    const owner = uniqueOwner();
    const mem = saveMemory(owner, "Old ref memory", "observation");

    sqlite.prepare(
      "UPDATE agent_memory SET last_referenced_at = datetime('now', '-28 days') WHERE id = ?"
    ).run(mem!.id);

    const scored = getActiveMemoriesScored(owner, 10);
    // 28 days ago: usageBoost ≈ 0.5, score ≈ 1.0 * 1.0 * 0.5 = 0.5
    expect(scored[0].score).toBeCloseTo(0.5, 1);
  });

  it("should rank agent memories above worker memories at equal age", () => {
    const owner = uniqueOwner();
    saveMemory(owner, "Agent memory", "observation"); // source=agent
    sqlite.prepare(
      `INSERT INTO agent_memory (id, owner_key, content, memory_type, content_hash, confidence, is_active, source, created_at)
       VALUES (?, ?, 'Worker memory', 'pattern', ?, 0.8, 1, 'worker', datetime('now'))`
    ).run(randomUUID(), owner, randomUUID());

    const scored = getActiveMemoriesScored(owner, 10);
    expect(scored[0].content).toBe("Agent memory");
    expect(scored[1].content).toBe("Worker memory");
  });
});
