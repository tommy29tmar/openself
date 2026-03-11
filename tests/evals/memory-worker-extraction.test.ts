// tests/evals/memory-worker-extraction.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { saveMemoryFromWorker, getActiveMemories, saveMemory } from "@/lib/services/memory-service";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

function uniqueOwner() {
  return `test-worker-mem-${randomUUID()}`;
}

afterAll(() => {
  sqlite.prepare("DELETE FROM agent_memory WHERE owner_key LIKE 'test-worker-mem-%'").run();
});

describe("saveMemoryFromWorker", () => {
  it("saves with source='worker' provenance", () => {
    const owner = uniqueOwner();
    const mem = saveMemoryFromWorker(owner, "User prefers bullet points");
    expect(mem).not.toBeNull();
    expect(mem!.source).toBe("worker");
    expect(mem!.memoryType).toBe("pattern");
  });

  it("does NOT enforce per-minute cooldown", () => {
    const owner = uniqueOwner();
    // Save 10 memories rapidly — should all succeed (no 5/60s cooldown)
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(saveMemoryFromWorker(owner, `Pattern observation ${i}`));
    }
    const saved = results.filter(r => r !== null);
    expect(saved.length).toBe(10);
  });

  it("still enforces the 50 max quota", () => {
    const owner = uniqueOwner();
    for (let i = 0; i < 50; i++) {
      saveMemoryFromWorker(owner, `Quota test ${i}`);
    }
    const overflow = saveMemoryFromWorker(owner, "This should be rejected");
    expect(overflow).toBeNull();
  });

  it("deduplicates by content hash", () => {
    const owner = uniqueOwner();
    const first = saveMemoryFromWorker(owner, "User likes dark mode");
    const dupe = saveMemoryFromWorker(owner, "User likes dark mode");
    expect(first).not.toBeNull();
    expect(dupe).toBeNull();
  });

  it("worker writes do not trip agent cooldown", () => {
    const owner = uniqueOwner();
    // Write 5 worker memories (fills normal cooldown limit)
    for (let i = 0; i < 5; i++) {
      saveMemoryFromWorker(owner, `Worker pattern ${i}`);
    }
    // Agent should still be able to write (worker writes are excluded from cooldown)
    const agentMem = saveMemory(owner, "Agent observation after worker writes");
    expect(agentMem).not.toBeNull();
  });
});

describe("saveMemory (agent path) sets source='agent'", () => {
  it("saves with source='agent' by default", () => {
    const owner = uniqueOwner();
    const mem = saveMemory(owner, "Agent observation");
    expect(mem).not.toBeNull();
    const row = sqlite.prepare("SELECT source FROM agent_memory WHERE id = ?").get(mem!.id) as any;
    expect(row.source).toBe("agent");
  });
});
