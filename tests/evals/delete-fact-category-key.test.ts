import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { facts, sessions, page, agentConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createFact, findFactsByOwnerCategoryKey } from "@/lib/services/kb-service";
import { createAgentTools } from "@/lib/agent/tools";

const SESSION_ID = `test-delcat-${randomUUID().slice(0, 8)}`;
const PROFILE_ID = `profile-delcat-${randomUUID().slice(0, 8)}`;
const createdFactIds: string[] = [];

const toolCtx = { toolCallId: "tc1", messages: [] as any[], abortSignal: new AbortController().signal };

beforeAll(() => {
  db.insert(sessions).values({ id: SESSION_ID, inviteCode: "test" }).run();
});

afterAll(() => {
  for (const id of createdFactIds) {
    try { db.delete(facts).where(eq(facts.id, id)).run(); } catch { /* ignore */ }
  }
  db.delete(facts).where(eq(facts.sessionId, SESSION_ID)).run();
  db.delete(page).where(eq(page.sessionId, SESSION_ID)).run();
  db.delete(agentConfig).where(eq(agentConfig.sessionId, SESSION_ID)).run();
  db.delete(sessions).where(eq(sessions.id, SESSION_ID)).run();
});

describe("findFactsByOwnerCategoryKey", () => {
  it("finds facts by category and key for a given owner (via readKeys)", async () => {
    const f1 = await createFact(
      { category: "education", key: "university-x", value: { institution: "MIT" } },
      SESSION_ID, PROFILE_ID,
    );
    createdFactIds.push(f1.id);

    const found = findFactsByOwnerCategoryKey(PROFILE_ID, "education", "university-x", [SESSION_ID]);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(f1.id);
  });

  it("returns empty array when no match", () => {
    const found = findFactsByOwnerCategoryKey(PROFILE_ID, "nonexistent", "nope", [SESSION_ID]);
    expect(found).toHaveLength(0);
  });
});

describe("create_fact duplicate detection", () => {
  it("returns idempotent when creating same category/key with identical value", async () => {
    const uniqueKey = `dedup-test-${randomUUID().slice(0, 6)}`;
    const { tools } = createAgentTools("en", SESSION_ID, PROFILE_ID, "req-1", [SESSION_ID], "onboarding", undefined, SESSION_ID);

    // Create initial fact
    const result1 = await tools.create_fact.execute(
      { category: "skill", key: uniqueKey, value: { name: "TypeScript", level: "senior" } },
      toolCtx,
    );
    expect(result1.success).toBe(true);
    createdFactIds.push(result1.factId!);

    // Retry with same value (different key order) — should be idempotent
    const result2 = await tools.create_fact.execute(
      { category: "skill", key: uniqueKey, value: { level: "senior", name: "TypeScript" } },
      toolCtx,
    );
    expect(result2.success).toBe(true);
    expect((result2 as any).idempotent).toBe(true);
    expect(result2.factId).toBe(result1.factId);
  });

  it("rejects create with different value for existing category/key", async () => {
    const uniqueKey = `dedup-diff-${randomUUID().slice(0, 6)}`;
    const { tools } = createAgentTools("en", SESSION_ID, PROFILE_ID, "req-2", [SESSION_ID], "onboarding", undefined, SESSION_ID);

    // Create initial fact
    const result1 = await tools.create_fact.execute(
      { category: "skill", key: uniqueKey, value: { name: "TypeScript", level: "senior" } },
      toolCtx,
    );
    expect(result1.success).toBe(true);
    createdFactIds.push(result1.factId!);

    // Create with different value — should be blocked
    const result2 = await tools.create_fact.execute(
      { category: "skill", key: uniqueKey, value: { name: "TypeScript", level: "junior" } },
      toolCtx,
    );
    expect(result2.success).toBe(false);
    expect((result2 as any).hint).toContain("remove the existing entry");
    expect((result2 as any).existingFactId).toBe(result1.factId);
  });
});

describe("delete_fact with category/key format", () => {
  it("deletes a fact using category/key format", async () => {
    const uniqueKey = `del-catkey-${randomUUID().slice(0, 6)}`;
    const { tools } = createAgentTools("en", SESSION_ID, PROFILE_ID, "req-3", [SESSION_ID], "onboarding", undefined, SESSION_ID);

    const created = await tools.create_fact.execute(
      { category: "skill", key: uniqueKey, value: { name: "Go" } },
      toolCtx,
    );
    expect(created.success).toBe(true);
    createdFactIds.push(created.factId!);

    // Delete using category/key
    const deleted = await tools.delete_fact.execute(
      { factId: `skill/${uniqueKey}` },
      toolCtx,
    );
    expect(deleted.success).toBe(true);
    expect((deleted as any).deletedCount).toBe(1);

    // Verify it's gone
    const found = findFactsByOwnerCategoryKey(PROFILE_ID, "skill", uniqueKey, [SESSION_ID]);
    expect(found).toHaveLength(0);
  });

  it("returns error for non-existent category/key", async () => {
    const { tools } = createAgentTools("en", SESSION_ID, PROFILE_ID, "req-4", [SESSION_ID], "onboarding", undefined, SESSION_ID);

    const result = await tools.delete_fact.execute(
      { factId: "nonexistent/nope" },
      toolCtx,
    );
    expect(result.success).toBe(false);
    expect((result as any).hint).toContain("Search for available entries");
  });
});
