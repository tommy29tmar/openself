import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { facts, sessions, page, agentConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createAgentTools } from "@/lib/agent/tools";
import { createFact, getFactById } from "@/lib/services/kb-service";

const sessionId = "test-reorder-" + randomUUID().slice(0, 8);

beforeAll(() => {
  db.insert(sessions).values({ id: sessionId, inviteCode: "test" }).run();
});

afterAll(() => {
  db.delete(facts).where(eq(facts.sessionId, sessionId)).run();
  db.delete(page).where(eq(page.sessionId, sessionId)).run();
  db.delete(agentConfig).where(eq(agentConfig.sessionId, sessionId)).run();
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
});

function getTools() {
  return createAgentTools("en", sessionId);
}

describe("reorder_items tool", () => {
  it("writes sortOrder 0, 1, 2 on specified facts", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f0 = await createFact({ category: "skill", key: `a-${suffix}`, value: { name: "A" } }, sessionId);
    const f1 = await createFact({ category: "skill", key: `b-${suffix}`, value: { name: "B" } }, sessionId);
    const f2 = await createFact({ category: "skill", key: `c-${suffix}`, value: { name: "C" } }, sessionId);

    const tools = getTools();
    // Reverse order: C, B, A
    const result = await tools.reorder_items.execute(
      { factIds: [f2.id, f1.id, f0.id] },
      { toolCallId: "t", messages: [] },
    );
    expect(result.success).toBe(true);
    expect((result as any).reordered).toBe(3);

    // Verify sortOrder
    const r0 = db.select().from(facts).where(eq(facts.id, f2.id)).get();
    const r1 = db.select().from(facts).where(eq(facts.id, f1.id)).get();
    const r2 = db.select().from(facts).where(eq(facts.id, f0.id)).get();
    expect(r0!.sortOrder).toBe(0);
    expect(r1!.sortOrder).toBe(1);
    expect(r2!.sortOrder).toBe(2);
  });

  it("unmentioned facts keep their sortOrder", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f0 = await createFact({ category: "skill", key: `x-${suffix}`, value: { name: "X" } }, sessionId);
    const f1 = await createFact({ category: "skill", key: `y-${suffix}`, value: { name: "Y" } }, sessionId);
    const unmentioned = await createFact({ category: "skill", key: `z-${suffix}`, value: { name: "Z" } }, sessionId);

    const tools = getTools();
    await tools.reorder_items.execute(
      { factIds: [f1.id, f0.id] },
      { toolCallId: "t", messages: [] },
    );

    // Unmentioned fact keeps its original sortOrder
    const row = db.select().from(facts).where(eq(facts.id, unmentioned.id)).get();
    expect(row!.sortOrder).toBe(unmentioned.sortOrder);
  });

  it("rejects composite sections (identity → hero/bio)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f = await createFact({ category: "identity", key: `name-${suffix}`, value: { name: "John Doe" } }, sessionId);
    const tools = getTools();
    const result = await tools.reorder_items.execute(
      { factIds: [f.id] },
      { toolCallId: "t", messages: [] },
    );
    expect(result.success).toBe(false);
    expect((result as any).error).toContain("composite section");
  });

  it("rejects if factIds belong to different categories", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f0 = await createFact({ category: "skill", key: `sk-${suffix}`, value: { name: "Skill" } }, sessionId);
    const f1 = await createFact({ category: "project", key: `pr-${suffix}`, value: { name: "Project" } }, sessionId);
    const tools = getTools();
    const result = await tools.reorder_items.execute(
      { factIds: [f0.id, f1.id] },
      { toolCallId: "t", messages: [] },
    );
    expect(result.success).toBe(false);
    expect((result as any).error).toContain("category");
  });

  it("handles 0 factIds (empty reorder)", async () => {
    const tools = getTools();
    const result = await tools.reorder_items.execute(
      { factIds: [] },
      { toolCallId: "t", messages: [] },
    );
    expect(result.success).toBe(true);
    expect((result as any).reordered).toBe(0);
  });

  it("handles 1 factId (single-element reorder)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f = await createFact({ category: "skill", key: `solo-${suffix}`, value: { name: "Solo" } }, sessionId);
    const tools = getTools();
    const result = await tools.reorder_items.execute(
      { factIds: [f.id] },
      { toolCallId: "t", messages: [] },
    );
    expect(result.success).toBe(true);
    expect((result as any).reordered).toBe(1);
    const row = db.select().from(facts).where(eq(facts.id, f.id)).get();
    expect(row!.sortOrder).toBe(0);
  });
});
