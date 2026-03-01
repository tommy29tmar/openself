import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { facts, sessions, page, agentConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createAgentTools } from "@/lib/agent/tools";
import { createFact, getFactById, getActiveFacts } from "@/lib/services/kb-service";

const sessionId = "test-archive-" + randomUUID().slice(0, 8);

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
  const tools = createAgentTools("en", sessionId);
  return tools;
}

describe("archive_fact tool", () => {
  it("sets archived_at timestamp", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f = await createFact({ category: "skill", key: `arch-${suffix}`, value: { name: "Go" } }, sessionId);
    const tools = getTools();
    const result = await tools.archive_fact.execute({ factId: f.id }, { toolCallId: "t", messages: [] });
    expect(result.success).toBe(true);
    // Direct DB check — getFactById excludes archived
    const row = db.select().from(facts).where(eq(facts.id, f.id)).get();
    expect(row).toBeDefined();
    expect(row!.archivedAt).not.toBeNull();
  });

  it("fact disappears from getActiveFacts", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f = await createFact({ category: "skill", key: `act-${suffix}`, value: { name: "Rust" } }, sessionId);
    const tools = getTools();
    await tools.archive_fact.execute({ factId: f.id }, { toolCallId: "t", messages: [] });
    const active = getActiveFacts(sessionId);
    expect(active.find(a => a.id === f.id)).toBeUndefined();
  });

  it("orphans children (sets parent_fact_id to null)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const parent = await createFact({ category: "experience", key: `par-${suffix}`, value: { role: "Dev", company: "X", status: "past" } }, sessionId);
    const child = await createFact({ category: "project", key: `child-${suffix}`, value: { name: "P1" }, parentFactId: parent.id }, sessionId);
    const tools = getTools();
    await tools.archive_fact.execute({ factId: parent.id }, { toolCallId: "t", messages: [] });
    const orphan = getFactById(child.id, sessionId);
    expect(orphan).not.toBeNull();
    expect(orphan!.parentFactId).toBeNull();
  });

  it("archive on already-archived fact is idempotent", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f = await createFact({ category: "skill", key: `idem-${suffix}`, value: { name: "C++" } }, sessionId);
    const tools = getTools();
    await tools.archive_fact.execute({ factId: f.id }, { toolCallId: "t", messages: [] });
    const result = await tools.archive_fact.execute({ factId: f.id }, { toolCallId: "t2", messages: [] });
    expect(result.success).toBe(true);
    expect((result as any).alreadyArchived).toBe(true);
  });

  it("archive with non-existent factId returns error", async () => {
    const tools = getTools();
    const result = await tools.archive_fact.execute({ factId: "nonexistent-id" }, { toolCallId: "t", messages: [] });
    expect(result.success).toBe(false);
    expect((result as any).error).toBe("FACT_NOT_FOUND");
  });
});

describe("unarchive_fact tool", () => {
  it("clears archived_at", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f = await createFact({ category: "skill", key: `un-${suffix}`, value: { name: "Java" } }, sessionId);
    const tools = getTools();
    await tools.archive_fact.execute({ factId: f.id }, { toolCallId: "t", messages: [] });
    const result = await tools.unarchive_fact.execute({ factId: f.id }, { toolCallId: "t2", messages: [] });
    expect(result.success).toBe(true);
    const row = db.select().from(facts).where(eq(facts.id, f.id)).get();
    expect(row!.archivedAt).toBeNull();
  });

  it("fact reappears in getActiveFacts", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f = await createFact({ category: "skill", key: `reap-${suffix}`, value: { name: "Python" } }, sessionId);
    const tools = getTools();
    await tools.archive_fact.execute({ factId: f.id }, { toolCallId: "t", messages: [] });
    expect(getActiveFacts(sessionId).find(a => a.id === f.id)).toBeUndefined();
    await tools.unarchive_fact.execute({ factId: f.id }, { toolCallId: "t2", messages: [] });
    expect(getActiveFacts(sessionId).find(a => a.id === f.id)).toBeDefined();
  });

  it("unarchive on non-archived fact is no-op", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f = await createFact({ category: "skill", key: `noop-${suffix}`, value: { name: "Elixir" } }, sessionId);
    const tools = getTools();
    const result = await tools.unarchive_fact.execute({ factId: f.id }, { toolCallId: "t", messages: [] });
    expect(result.success).toBe(true);
    expect((result as any).alreadyActive).toBe(true);
  });

  it("unarchive with non-existent factId returns error", async () => {
    const tools = getTools();
    const result = await tools.unarchive_fact.execute({ factId: "nonexistent-id" }, { toolCallId: "t", messages: [] });
    expect(result.success).toBe(false);
    expect((result as any).error).toBe("FACT_NOT_FOUND");
  });
});
