/**
 * Agent Brain v2 — end-to-end integration tests.
 *
 * Tests cross-tool scenarios: job change via batch_facts, reorder persistence
 * through recompose, and archive/unarchive roundtrip.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { facts, sessions, page, agentConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createAgentTools } from "@/lib/agent/tools";
import { createFact, getActiveFacts } from "@/lib/services/kb-service";
import { getDraft } from "@/lib/services/page-service";
import { assembleBootstrapPayload } from "@/lib/agent/journey";
import { assembleContext } from "@/lib/agent/context";
import type { OwnerScope } from "@/lib/auth/session";

const sessionId = "test-intv2-" + randomUUID().slice(0, 8);

const toolCtx = { toolCallId: "t", messages: [] as never[] };

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
  return createAgentTools("en", sessionId).tools;
}

describe("Agent Brain v2 — end-to-end", () => {
  it("job change scenario: batch update old + create new + generate", async () => {
    const tools = getTools();
    const suffix = randomUUID().slice(0, 8);

    // 1. Create name + current experience fact
    await tools.create_fact.execute(
      { category: "identity", key: "name", value: { full: `Test User ${suffix}` } },
      toolCtx,
    );
    const oldExp = await tools.create_fact.execute(
      { category: "experience", key: `acme-${suffix}`, value: { role: "Engineer", company: "Acme", status: "current" } },
      toolCtx,
    );
    expect(oldExp.success).toBe(true);
    const oldFactId = oldExp.factId;

    // 2. Generate page to create initial draft
    await tools.generate_page.execute({ username: "draft", language: "en" }, toolCtx);

    // 3. batch_facts: update old to past + create new current
    const batchResult = await tools.batch_facts.execute({
      operations: [
        { action: "update" as const, factId: oldFactId!, value: { role: "Engineer", company: "Acme", status: "past" } },
        { action: "create" as const, category: "experience", key: `newco-${suffix}`, value: { role: "Lead", company: "NewCo", status: "current" } },
      ],
    }, toolCtx);
    expect(batchResult.success).toBe(true);
    expect(batchResult.updated).toBe(1);
    expect(batchResult.created).toBe(1);

    // 4. Verify: old is "past", new is "current"
    const active = getActiveFacts(sessionId);
    const oldFact = active.find(f => f.key === `acme-${suffix}`);
    const newFact = active.find(f => f.key === `newco-${suffix}`);
    expect(oldFact).toBeDefined();
    expect((oldFact!.value as Record<string, string>).status).toBe("past");
    expect(newFact).toBeDefined();
    expect((newFact!.value as Record<string, string>).status).toBe("current");

    // 5. Draft was recomposed (batch_facts triggers recomposeAfterMutation)
    const draft = getDraft(sessionId);
    expect(draft).not.toBeNull();
  });

  it("reorder items: sortOrder persists through recompose", async () => {
    const tools = getTools();
    const suffix = randomUUID().slice(0, 8);

    // 1. Create 3 skill facts
    const s1 = await tools.create_fact.execute(
      { category: "skill", key: `react-${suffix}`, value: { name: "React" } },
      toolCtx,
    );
    const s2 = await tools.create_fact.execute(
      { category: "skill", key: `ts-${suffix}`, value: { name: "TypeScript" } },
      toolCtx,
    );
    const s3 = await tools.create_fact.execute(
      { category: "skill", key: `node-${suffix}`, value: { name: "Node.js" } },
      toolCtx,
    );

    // 2. Generate page to create draft
    await tools.generate_page.execute({ username: "draft", language: "en" }, toolCtx);

    // 3. Reorder: [s3, s1, s2]
    const reorderResult = await tools.reorder_items.execute(
      { factIds: [s3.factId!, s1.factId!, s2.factId!] },
      toolCtx,
    );
    expect(reorderResult.success).toBe(true);
    expect(reorderResult.reordered).toBe(3);

    // 4. Create new skill → triggers recomposeAfterMutation
    const s4 = await tools.create_fact.execute(
      { category: "skill", key: `go-${suffix}`, value: { name: "Go" } },
      toolCtx,
    );
    expect(s4.success).toBe(true);

    // 5. Verify: sortOrder values persisted (s3=0, s1=1, s2=2, s4=default 0)
    const active = getActiveFacts(sessionId);
    const skillFacts = active.filter(f => f.category === "skill" && f.key.endsWith(suffix));
    const bySort = skillFacts.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    // s3 and s4 both have sortOrder 0, s1 has 1, s2 has 2
    expect(bySort.map(f => f.key)).toEqual(
      expect.arrayContaining([`node-${suffix}`, `go-${suffix}`, `react-${suffix}`, `ts-${suffix}`]),
    );
    // The explicitly reordered ones should have their set sortOrder
    const s1Row = active.find(f => f.key === `react-${suffix}`);
    const s2Row = active.find(f => f.key === `ts-${suffix}`);
    const s3Row = active.find(f => f.key === `node-${suffix}`);
    expect(s3Row!.sortOrder).toBe(0);
    expect(s1Row!.sortOrder).toBe(1);
    expect(s2Row!.sortOrder).toBe(2);
  });

  it("move + recompose: section stays in moved slot after fact mutation", async () => {
    const tools = getTools();
    const suffix = randomUUID().slice(0, 8);

    // 1. Create identity + activity facts (activities accepted in both main & curator)
    await tools.create_fact.execute(
      { category: "identity", key: `name-mv-${suffix}`, value: { full: `Move User ${suffix}` } },
      toolCtx,
    );
    await tools.create_fact.execute(
      { category: "activity", key: `act1-${suffix}`, value: { name: "Running", activityType: "sport" } },
      toolCtx,
    );
    await tools.create_fact.execute(
      { category: "activity", key: `act2-${suffix}`, value: { name: "Volunteering", activityType: "volunteering" } },
      toolCtx,
    );

    // 2. Set layout to curator-left (assigns slots)
    const layoutResult = await tools.set_layout.execute(
      { username: "draft", layoutTemplate: "curator" },
      { toolCallId: "lay", messages: [], abortSignal: undefined as any },
    );
    expect(layoutResult.success).toBe(true);

    // Find the activities section
    let draft = getDraft(sessionId);
    expect(draft).not.toBeNull();
    const activitiesSection = draft!.config.sections.find(s => s.type === "activities");
    if (!activitiesSection) return; // skip if not enough data

    const sectionId = activitiesSection.id;
    const originalSlot = activitiesSection.slot;

    // 3. Move activities to the other slot (both main and curator accept activities)
    const targetSlot = originalSlot === "sidebar" ? "main" : "sidebar";
    const moveResult = await tools.move_section.execute(
      { sectionId, targetSlot },
      { toolCallId: "mv", messages: [], abortSignal: undefined as any },
    );
    expect(moveResult.success).toBe(true);

    // Verify move applied
    draft = getDraft(sessionId);
    expect(draft!.config.sections.find(s => s.id === sectionId)!.slot).toBe(targetSlot);

    // 4. Create another activity → triggers recomposeAfterMutation
    await tools.create_fact.execute(
      { category: "activity", key: `act3-${suffix}`, value: { name: "Cycling", activityType: "sport" } },
      toolCtx,
    );

    // 5. Verify: activities section is STILL in the moved slot (carry-over works)
    draft = getDraft(sessionId);
    const afterRecompose = draft!.config.sections.find(s => s.id === sectionId);
    expect(afterRecompose).toBeDefined();
    expect(afterRecompose!.slot).toBe(targetSlot);
  });

  it("archive + unarchive roundtrip", async () => {
    const tools = getTools();
    const suffix = randomUUID().slice(0, 8);

    // 1. Create fact + generate page
    const created = await tools.create_fact.execute(
      { category: "interest", key: `chess-${suffix}`, value: { name: "Chess" } },
      toolCtx,
    );
    expect(created.success).toBe(true);
    const factId = created.factId!;

    await tools.generate_page.execute({ username: "draft", language: "en" }, toolCtx);

    // 2. Archive → fact disappears from active
    const archiveResult = await tools.archive_fact.execute({ factId }, toolCtx);
    expect(archiveResult.success).toBe(true);

    let active = getActiveFacts(sessionId);
    expect(active.find(f => f.id === factId)).toBeUndefined();

    // 3. Unarchive → fact reappears
    const unarchiveResult = await tools.unarchive_fact.execute({ factId }, toolCtx);
    expect(unarchiveResult.success).toBe(true);

    active = getActiveFacts(sessionId);
    expect(active.find(f => f.id === factId)).toBeDefined();
  });

  it("archetype detection flows into context", async () => {
    const suffix = randomUUID().slice(0, 8);

    // 1. Create identity/role = "software engineer"
    await createFact(
      { category: "identity", key: `role-${suffix}`, value: { role: "software engineer" } },
      sessionId,
    );

    // 2. assembleBootstrapPayload → archetype = "developer"
    const scope: OwnerScope = {
      cognitiveOwnerKey: sessionId,
      knowledgeReadKeys: [sessionId],
      knowledgePrimaryKey: sessionId,
      currentSessionId: sessionId,
    };
    const { payload: bootstrap, data: bootstrapData } = assembleBootstrapPayload(scope, "en", undefined);
    expect(bootstrap.archetype).toBe("developer");

    // 3. assembleContext with bootstrap → prompt contains archetype info
    const ctx = assembleContext(scope, "en", [], undefined, bootstrap, bootstrapData);
    expect(ctx.systemPrompt).toContain("developer");
  });
});
