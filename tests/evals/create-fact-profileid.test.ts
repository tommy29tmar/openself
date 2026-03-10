import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { facts, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createFact } from "@/lib/services/kb-service";
import { createAgentTools } from "@/lib/agent/tools";

const SESSION_ID = `test-profileid-${randomUUID().slice(0, 8)}`;
const PROFILE_ID = `profile-${randomUUID().slice(0, 8)}`;
const createdFactIds: string[] = [];

afterAll(() => {
  for (const id of createdFactIds) {
    db.delete(facts).where(eq(facts.id, id)).run();
  }
  try { db.delete(sessions).where(eq(sessions.id, SESSION_ID)).run(); } catch { /* FK deps */ }
});

describe("createFact profileId parameter", () => {
  it("sets profileId when 3rd argument is provided", async () => {
    db.insert(sessions).values({ id: SESSION_ID, inviteCode: "uat" }).run();
    const fact = await createFact(
      { category: "identity", key: `profileid-name-${randomUUID().slice(0, 6)}`, value: { full: "Alice Smith" } },
      SESSION_ID,
      PROFILE_ID,
    );
    createdFactIds.push(fact.id);
    const row = db.select().from(facts).where(eq(facts.id, fact.id)).get();
    expect(row!.profileId).toBe(PROFILE_ID);
  });

  it("falls back to sessionId when 3rd argument is omitted", async () => {
    const fact = await createFact(
      { category: "identity", key: `profileid-role-${randomUUID().slice(0, 6)}`, value: { role: "engineer" } },
      SESSION_ID,
    );
    createdFactIds.push(fact.id);
    const row = db.select().from(facts).where(eq(facts.id, fact.id)).get();
    expect(row!.profileId).toBe(SESSION_ID);
  });
});

describe("create_fact tool passes profileId", () => {
  it("sets profileId = effectiveOwnerKey on created fact", async () => {
    const { tools } = createAgentTools(
      "it",
      SESSION_ID,
      PROFILE_ID,
      "req-1",
      [SESSION_ID],
      "onboarding",
      undefined,
      SESSION_ID,
    );
    const result = await tools.create_fact.execute(
      { category: "skill", key: `test-skill-${randomUUID().slice(0, 6)}`, value: { name: "TypeScript" } },
      { toolCallId: "tc-1", messages: [] },
    );
    expect(result.success).toBe(true);
    const factId = result.factId as string;
    createdFactIds.push(factId);
    const row = db.select().from(facts).where(eq(facts.id, factId)).get();
    expect(row!.profileId).toBe(PROFILE_ID);
  });
});
