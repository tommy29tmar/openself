import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { facts, sessions, page, agentConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createAgentTools } from "@/lib/agent/tools";
import { createFact } from "@/lib/services/kb-service";
import { getDraft } from "@/lib/services/page-service";

const sessionId = "test-reorder-sec-" + randomUUID().slice(0, 8);

beforeAll(async () => {
  db.insert(sessions).values({ id: sessionId, inviteCode: "test" }).run();
  // Create facts so ensureDraft() can compose a page
  await createFact({ category: "identity", key: "name", value: { name: "Jane Doe" } }, sessionId);
  await createFact({ category: "skill", key: "ts", value: { name: "TypeScript" } }, sessionId);
  await createFact({ category: "project", key: "p1", value: { name: "Alpha Project" } }, sessionId);
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

describe("reorder_sections — slot validation", () => {
  it("returns success and reorders sections", async () => {
    const tools = getTools();
    // First call generate_page to have a real draft
    await tools.generate_page.execute(
      { username: "draft", language: "en" },
      { toolCallId: "t", messages: [] },
    );

    const draft = getDraft(sessionId);
    expect(draft).not.toBeNull();
    const sectionIds = draft!.config.sections.map(s => s.id);
    expect(sectionIds.length).toBeGreaterThanOrEqual(2);

    // Reverse the order
    const reversed = [...sectionIds].reverse();
    const result = await tools.reorder_sections.execute(
      { username: "draft", sectionOrder: reversed },
      { toolCallId: "t2", messages: [] },
    );
    expect(result.success).toBe(true);

    // Verify reorder applied
    const updated = getDraft(sessionId);
    expect(updated!.config.sections.map(s => s.id)).toEqual(reversed);
  });

  it("moveSection+afterSection moves a section by type name", async () => {
    const tools = getTools();
    const draft = getDraft(sessionId);
    const typesBefore = draft!.config.sections.map(s => s.type);
    // Move skills after bio (if both exist)
    const hasSkills = typesBefore.includes("skills");
    const hasBio = typesBefore.includes("bio");
    if (!hasSkills || !hasBio) return; // skip if sections don't exist

    const result = await tools.reorder_sections.execute(
      { username: "draft", moveSection: "skills", afterSection: "bio" },
      { toolCallId: "t-move", messages: [] },
    );
    expect(result.success).toBe(true);
    expect((result as any).newOrder).toBeDefined();

    const updated = getDraft(sessionId);
    const typesAfter = updated!.config.sections.map(s => s.type);
    const bioIdx = typesAfter.indexOf("bio");
    const skillsIdx = typesAfter.indexOf("skills");
    expect(skillsIdx).toBe(bioIdx + 1);
  });

  it("moveSection == afterSection is a no-op", async () => {
    const tools = getTools();
    const draft = getDraft(sessionId);
    const orderBefore = draft!.config.sections.map(s => s.id);

    const result = await tools.reorder_sections.execute(
      { username: "draft", moveSection: "bio", afterSection: "bio" },
      { toolCallId: "t-self", messages: [] },
    );
    expect(result.success).toBe(true);
    expect((result as any).hint).toContain("already in position");

    const updated = getDraft(sessionId);
    expect(updated!.config.sections.map(s => s.id)).toEqual(orderBefore);
  });

  it("moveSection with nonexistent type returns error with available types", async () => {
    const tools = getTools();
    const result = await tools.reorder_sections.execute(
      { username: "draft", moveSection: "nonexistent", afterSection: "bio" },
      { toolCallId: "t-missing", messages: [] },
    );
    expect(result.success).toBe(false);
    expect((result as any).error).toContain("not found");
    expect((result as any).error).toContain("Available:");
  });

  it("rejects moving hero section", async () => {
    const tools = getTools();
    const result = await tools.reorder_sections.execute(
      { username: "draft", moveSection: "hero", afterSection: "bio" },
      { toolCallId: "t-hero", messages: [] },
    );
    expect(result.success).toBe(false);
    expect((result as any).error).toContain("fixed structural section");
  });

  it("warnings field is present when validation finds issues (advisory only)", async () => {
    // The reorder_sections tool now runs validation — if warnings appear,
    // they should be in the result but not block the operation
    const tools = getTools();
    const draft = getDraft(sessionId);
    const sectionIds = draft!.config.sections.map(s => s.id);
    const result = await tools.reorder_sections.execute(
      { username: "draft", sectionOrder: sectionIds },
      { toolCallId: "t3", messages: [] },
    );
    // Success regardless of warnings
    expect(result.success).toBe(true);
    // warnings field is either absent or an array
    if ((result as any).warnings) {
      expect(Array.isArray((result as any).warnings)).toBe(true);
    }
  });
});
