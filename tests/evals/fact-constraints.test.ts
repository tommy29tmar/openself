import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { facts, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  createFact,
  updateFact,
  deleteFact,
  getFactById,
} from "@/lib/services/kb-service";
import { FactConstraintError } from "@/lib/services/fact-constraints";

// Isolated session to avoid cross-test interference
const sessionId = "test-constraints-" + randomUUID().slice(0, 8);
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
  cleanup();
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
});

describe("FactConstraintError — current uniqueness", () => {
  beforeEach(cleanup);

  it("blocks creating second current experience when one exists", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f1 = await createFact({
      category: "experience",
      key: `acme-${suffix}`,
      value: { role: "Dev", company: "Acme", status: "current" },
    }, sessionId);
    createdIds.push(f1.id);

    await expect(createFact({
      category: "experience",
      key: `beta-${suffix}`,
      value: { role: "Lead", company: "Beta", status: "current" },
    }, sessionId)).rejects.toThrow(FactConstraintError);
  });

  it("allows creating current experience when no current exists", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f1 = await createFact({
      category: "experience",
      key: `past-${suffix}`,
      value: { role: "Dev", company: "OldCo", status: "past" },
    }, sessionId);
    createdIds.push(f1.id);

    const f2 = await createFact({
      category: "experience",
      key: `curr-${suffix}`,
      value: { role: "Lead", company: "NewCo", status: "current" },
    }, sessionId);
    createdIds.push(f2.id);
    expect(f2).toBeDefined();
  });

  it("allows two current education facts (dual degree is valid)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f1 = await createFact({
      category: "education",
      key: `cs-${suffix}`,
      value: { degree: "CS", school: "MIT", status: "current" },
    }, sessionId);
    createdIds.push(f1.id);

    const f2 = await createFact({
      category: "education",
      key: `mba-${suffix}`,
      value: { degree: "MBA", school: "Stanford", status: "current" },
    }, sessionId);
    createdIds.push(f2.id);
    expect(f2).toBeDefined();
  });

  it("error includes existingFactId and suggestion", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f1 = await createFact({
      category: "experience",
      key: `acme-${suffix}`,
      value: { role: "Dev", company: "Acme", status: "current" },
    }, sessionId);
    createdIds.push(f1.id);

    try {
      await createFact({
        category: "experience",
        key: `beta-${suffix}`,
        value: { role: "Lead", company: "Beta", status: "current" },
      }, sessionId);
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(FactConstraintError);
      const e = err as FactConstraintError;
      expect(e.code).toBe("EXISTING_CURRENT");
      expect(e.existingFactId).toBe(f1.id);
      expect(e.suggestion).toContain("past");
    }
  });

  it("upsert with same key does not trigger constraint (idempotent)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f1 = await createFact({
      category: "experience",
      key: `acme-${suffix}`,
      value: { role: "Dev", company: "Acme", status: "current" },
    }, sessionId);
    createdIds.push(f1.id);

    // Same key = upsert, should NOT throw
    const f2 = await createFact({
      category: "experience",
      key: `acme-${suffix}`,
      value: { role: "Senior Dev", company: "Acme", status: "current" },
    }, sessionId);
    expect(f2.key).toBe(`acme-${suffix}`);
  });
});

describe("updateFact — current uniqueness", () => {
  beforeEach(cleanup);

  it("blocks updating to current when another current exists", async () => {
    const suffix = randomUUID().slice(0, 8);
    const f1 = await createFact({
      category: "experience",
      key: `curr-${suffix}`,
      value: { role: "Dev", company: "Acme", status: "current" },
    }, sessionId);
    createdIds.push(f1.id);

    const f2 = await createFact({
      category: "experience",
      key: `past-${suffix}`,
      value: { role: "Lead", company: "Beta", status: "past" },
    }, sessionId);
    createdIds.push(f2.id);

    expect(() => updateFact({
      factId: f2.id,
      value: { role: "Lead", company: "Beta", status: "current" },
    }, sessionId)).toThrow(FactConstraintError);
  });
});

describe("Cascade check — parent warnings", () => {
  beforeEach(cleanup);

  it("updateFact warns when fact has children", async () => {
    const suffix = randomUUID().slice(0, 8);
    const parent = await createFact({
      category: "experience",
      key: `parent-${suffix}`,
      value: { role: "Dev", company: "Acme", status: "past" },
    }, sessionId);
    createdIds.push(parent.id);

    const child = await createFact({
      category: "project",
      key: `child-${suffix}`,
      value: { name: "Alpha" },
      parentFactId: parent.id,
    }, sessionId);
    createdIds.push(child.id);

    const result = updateFact({
      factId: parent.id,
      value: { role: "Senior Dev", company: "Acme", status: "past" },
    }, sessionId);

    expect(result).not.toBeNull();
    expect((result as any)._warnings).toBeDefined();
    expect((result as any)._warnings[0]).toContain("child fact");
  });

  it("deleteFact orphans children (sets parent_fact_id to null)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const parent = await createFact({
      category: "experience",
      key: `parent-${suffix}`,
      value: { role: "Dev", company: "Acme", status: "past" },
    }, sessionId);
    createdIds.push(parent.id);

    const child = await createFact({
      category: "project",
      key: `child-${suffix}`,
      value: { name: "Alpha" },
      parentFactId: parent.id,
    }, sessionId);
    createdIds.push(child.id);

    deleteFact(parent.id, sessionId);

    const orphan = getFactById(child.id, sessionId);
    expect(orphan).not.toBeNull();
    expect(orphan!.parentFactId).toBeNull();
  });
});
