import { describe, it, expect, afterAll } from "vitest";
import { saveMemory, saveMemoryFromWorker, getActiveMemoriesScored } from "@/lib/services/memory-service";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

function uniqueOwner() { return `test-evict-${randomUUID()}`; }

afterAll(() => {
  sqlite.prepare("DELETE FROM agent_memory WHERE owner_key LIKE 'test-evict-%'").run();
});

describe("memory eviction policy", () => {
  it("should evict lowest-scoring memory when saving #51", () => {
    const owner = uniqueOwner();

    // Fill to 50 with worker memories (lowest scoring due to provenance 0.6)
    for (let i = 0; i < 50; i++) {
      saveMemoryFromWorker(owner, `Worker pattern ${i}`);
    }

    const before = sqlite.prepare(
      "SELECT COUNT(*) as c FROM agent_memory WHERE owner_key = ? AND is_active = 1"
    ).get(owner) as any;
    expect(before.c).toBe(50);

    // Save #51 — should evict the lowest-scoring worker pattern
    const result = saveMemory(owner, "Important agent observation");
    expect(result).not.toBeNull();

    // Still 50 active (one evicted, one added)
    const after = sqlite.prepare(
      "SELECT COUNT(*) as c FROM agent_memory WHERE owner_key = ? AND is_active = 1"
    ).get(owner) as any;
    expect(after.c).toBe(50);
  });

  it("should protect minimum 5 agent memories from eviction", () => {
    const owner = uniqueOwner();

    // Fill with 5 agent + 45 worker
    for (let i = 0; i < 5; i++) {
      saveMemory(owner, `Agent mem ${i}`);
    }
    for (let i = 0; i < 45; i++) {
      saveMemoryFromWorker(owner, `Worker mem ${i}`);
    }

    // Save #51 — should evict a worker, not an agent memory
    saveMemoryFromWorker(owner, "New worker pattern");

    const agentCount = sqlite.prepare(
      "SELECT COUNT(*) as c FROM agent_memory WHERE owner_key = ? AND is_active = 1 AND source = 'agent'"
    ).get(owner) as any;
    expect(agentCount.c).toBe(5); // All 5 agent memories preserved
  });
});
