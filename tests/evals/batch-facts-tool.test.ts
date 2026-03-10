import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { facts, sessions, page, agentConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createAgentTools } from "@/lib/agent/tools";
import { getFactById, getActiveFacts } from "@/lib/services/kb-service";

// Isolated session
const sessionId = "test-batch-" + randomUUID().slice(0, 8);
const createdIds: string[] = [];

function cleanup() {
  for (const id of createdIds) {
    db.delete(facts).where(eq(facts.id, id)).run();
  }
  createdIds.length = 0;
}

beforeAll(() => {
  db.insert(sessions).values({ id: sessionId, inviteCode: "test" }).run();
});

afterAll(() => {
  // Delete ALL rows referencing this session to avoid FK issues
  db.delete(facts).where(eq(facts.sessionId, sessionId)).run();
  db.delete(page).where(eq(page.sessionId, sessionId)).run();
  db.delete(agentConfig).where(eq(agentConfig.sessionId, sessionId)).run();
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
});

describe("batch_facts tool", () => {
  beforeEach(cleanup);

  function getTools() {
    const { tools } = createAgentTools("en", sessionId);
    return tools.batch_facts;
  }

  it("creates multiple facts sequentially", async () => {
    const tool = getTools();
    const suffix = randomUUID().slice(0, 8);
    const result = await tool.execute({
      operations: [
        { action: "create" as const, category: "skill", key: `ts-${suffix}`, value: { name: "TypeScript" } },
        { action: "create" as const, category: "skill", key: `react-${suffix}`, value: { name: "React" } },
        { action: "create" as const, category: "skill", key: `node-${suffix}`, value: { name: "Node.js" } },
      ],
    }, { toolCallId: "test", messages: [] });

    expect(result.success).toBe(true);
    expect(result.created).toBe(3);

    // Track for cleanup
    const active = getActiveFacts(sessionId);
    for (const f of active) {
      if (f.key.endsWith(suffix)) createdIds.push(f.id);
    }
  });

  it("handles mixed operations (create + delete)", async () => {
    const tool = getTools();
    const suffix = randomUUID().slice(0, 8);

    // Pre-create a fact to delete
    const { tools } = createAgentTools("en", sessionId);
    const deleteResult = await tools.create_fact.execute(
      { category: "skill", key: `pre-delete-${suffix}`, value: { name: "ToDelete" } },
      { toolCallId: "pre2", messages: [] },
    );
    createdIds.push(deleteResult.factId!);

    const result = await tool.execute({
      operations: [
        { action: "create" as const, category: "skill", key: `new-${suffix}`, value: { name: "New" } },
        { action: "delete" as const, factId: deleteResult.factId! },
      ],
    }, { toolCallId: "test", messages: [] });

    expect(result.success).toBe(true);
    expect(result.created).toBe(1);
    expect(result.deleted).toBe(1);

    // Verify deletion
    const deletedFact = getFactById(deleteResult.factId!, sessionId);
    expect(deletedFact).toBeNull();

    // Cleanup new fact
    const active = getActiveFacts(sessionId);
    for (const f of active) {
      if (f.key === `new-${suffix}`) createdIds.push(f.id);
    }
  });

  it("rejects batches over 20 operations", async () => {
    const tool = getTools();
    const ops = Array.from({ length: 21 }, (_, i) => ({
      action: "create" as const,
      category: "skill",
      key: `over-${i}`,
      value: { name: `Skill ${i}` },
    }));

    // Runtime guard returns error result (Zod .max(20) only enforced at framework level)
    const result = await tool.execute(
      { operations: ops },
      { toolCallId: "test", messages: [] },
    );
    expect(result.success).toBe(false);
    expect((result as any).error).toBe("MAX_BATCH_SIZE");
  });

  it("handles empty operations array", async () => {
    const tool = getTools();
    const result = await tool.execute(
      { operations: [] },
      { toolCallId: "test", messages: [] },
    );

    expect(result.success).toBe(true);
    expect(result.created).toBe(0);
    expect(result.deleted).toBe(0);
  });

  it("handles single operation (degenerate batch)", async () => {
    const tool = getTools();
    const suffix = randomUUID().slice(0, 8);
    const result = await tool.execute({
      operations: [
        { action: "create" as const, category: "skill", key: `single-${suffix}`, value: { name: "Solo" } },
      ],
    }, { toolCallId: "test", messages: [] });

    expect(result.success).toBe(true);
    expect(result.created).toBe(1);

    const active = getActiveFacts(sessionId);
    for (const f of active) {
      if (f.key === `single-${suffix}`) createdIds.push(f.id);
    }
  });

  it("returns summary with counts", async () => {
    const tool = getTools();
    const suffix = randomUUID().slice(0, 8);
    const result = await tool.execute({
      operations: [
        { action: "create" as const, category: "skill", key: `a-${suffix}`, value: { name: "A" } },
        { action: "create" as const, category: "skill", key: `b-${suffix}`, value: { name: "B" } },
      ],
    }, { toolCallId: "test", messages: [] });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("created", 2);
    expect(result).toHaveProperty("deleted", 0);

    const active = getActiveFacts(sessionId);
    for (const f of active) {
      if (f.key.endsWith(suffix)) createdIds.push(f.id);
    }
  });

  it("stops at first validation error, earlier ops are persisted", async () => {
    const tool = getTools();
    const suffix = randomUUID().slice(0, 8);
    const result = await tool.execute({
      operations: [
        { action: "create" as const, category: "skill", key: `ok-${suffix}`, value: { name: "Valid" } },
        // Empty value triggers FactValidationError for experience (missing required fields)
        { action: "create" as const, category: "experience", key: `bad-${suffix}`, value: { role: "Dev", company: "N/A" } },
      ],
    }, { toolCallId: "test", messages: [] });

    // First op succeeded, second failed
    expect(result.success).toBe(false);
    expect((result as any).error).toBe("VALIDATION_ERROR");
    expect(result.created).toBe(1);

    // First fact was persisted
    const active = getActiveFacts(sessionId);
    const persisted = active.find(f => f.key === `ok-${suffix}`);
    expect(persisted).toBeDefined();
  });

  it("respects constraint layer within batch (two current experiences)", async () => {
    const tool = getTools();
    const suffix = randomUUID().slice(0, 8);
    const result = await tool.execute({
      operations: [
        { action: "create" as const, category: "experience", key: `first-${suffix}`, value: { role: "Dev", company: "Acme", status: "current" } },
        { action: "create" as const, category: "experience", key: `second-${suffix}`, value: { role: "Lead", company: "Beta", status: "current" } },
      ],
    }, { toolCallId: "test", messages: [] });

    // First op succeeded, second hit FactConstraintError
    expect(result.success).toBe(false);
    expect((result as any).code).toBe("EXISTING_CURRENT");
    expect(result.created).toBe(1);

    // First fact persisted
    const active = getActiveFacts(sessionId);
    const persisted = active.find(f => f.key === `first-${suffix}`);
    expect(persisted).toBeDefined();
  });
});
