import { describe, it, expect, afterAll, vi, beforeAll } from "vitest";

vi.mock("@/lib/flags", () => ({ PROFILE_ID_CANONICAL: true }));

import { db } from "@/lib/db";
import { facts, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createFact, backfillProfileId, getActiveFacts } from "@/lib/services/kb-service";

const ANON_SESSION = `test-anon-${randomUUID().slice(0, 8)}`;
const EXISTING_PROFILE_ID = `profile-${randomUUID().slice(0, 8)}`;
const createdFactIds: string[] = [];

beforeAll(() => {
  db.insert(sessions).values({ id: ANON_SESSION, inviteCode: "test" }).run();
});

afterAll(() => {
  for (const id of createdFactIds) {
    try { db.delete(facts).where(eq(facts.id, id)).run(); } catch {}
  }
  db.delete(sessions).where(eq(sessions.id, ANON_SESSION)).run();
});

describe("backfillProfileId (login/OAuth split-ID scenario)", () => {
  it("updates profileId on facts from anonymous sessions to existing profile", async () => {
    const f1 = await createFact(
      { category: "identity", key: "name", value: { full: "Test User" } },
      ANON_SESSION,
    );
    createdFactIds.push(f1.id);

    const f2 = await createFact(
      { category: "identity", key: "city", value: { city: "Roma" } },
      ANON_SESSION,
    );
    createdFactIds.push(f2.id);

    const before = db.select().from(facts).where(eq(facts.id, f1.id)).get();
    expect(before!.profileId).toBe(ANON_SESSION);

    const count = backfillProfileId([ANON_SESSION], EXISTING_PROFILE_ID);
    expect(count).toBe(2);

    const after1 = db.select().from(facts).where(eq(facts.id, f1.id)).get();
    const after2 = db.select().from(facts).where(eq(facts.id, f2.id)).get();
    expect(after1!.profileId).toBe(EXISTING_PROFILE_ID);
    expect(after2!.profileId).toBe(EXISTING_PROFILE_ID);
  });

  it("makes facts visible via getActiveFacts with PROFILE_ID_CANONICAL=true", async () => {
    const activeFacts = getActiveFacts(EXISTING_PROFILE_ID);
    const names = activeFacts.filter(f => f.category === "identity" && f.key === "name");
    expect(names.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT update facts that already have a different profileId", async () => {
    const OTHER_PROFILE = `other-${randomUUID().slice(0, 8)}`;
    const f3 = await createFact(
      { category: "skill", key: "test-skill", value: { name: "Go" } },
      ANON_SESSION,
      OTHER_PROFILE,
    );
    createdFactIds.push(f3.id);

    const count = backfillProfileId([ANON_SESSION], EXISTING_PROFILE_ID);
    const row = db.select().from(facts).where(eq(facts.id, f3.id)).get();
    expect(row!.profileId).toBe(OTHER_PROFILE);
    expect(count).toBe(0);
  });

  it("handles collision with existing profile fact (keeps newer)", async () => {
    // Profile already has a fact with same category/key
    const OTHER_SESSION = `test-other-${randomUUID().slice(0, 8)}`;
    db.insert(sessions).values({ id: OTHER_SESSION, inviteCode: "test" }).run();

    const existingFact = await createFact(
      { category: "identity", key: "collide-test", value: { name: "Old Name" } },
      OTHER_SESSION,
      EXISTING_PROFILE_ID,
    );
    createdFactIds.push(existingFact.id);

    const anonFact = await createFact(
      { category: "identity", key: "collide-test", value: { name: "New Name" } },
      ANON_SESSION,
    );
    createdFactIds.push(anonFact.id);

    const count = backfillProfileId([ANON_SESSION], EXISTING_PROFILE_ID);
    expect(count).toBeGreaterThanOrEqual(1);

    const anonRow = db.select().from(facts).where(eq(facts.id, anonFact.id)).get();
    const existingRow = db.select().from(facts).where(eq(facts.id, existingFact.id)).get();
    // Newer (anonFact) should win, older (existingFact) should be deleted
    expect(anonRow!.profileId).toBe(EXISTING_PROFILE_ID);
    expect(existingRow).toBeUndefined();

    // Cleanup
    db.delete(sessions).where(eq(sessions.id, OTHER_SESSION)).run();
  });
});
