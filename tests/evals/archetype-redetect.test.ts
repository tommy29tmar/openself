import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() })) },
  db: {},
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { shouldRedetectArchetype } from "@/lib/agent/journey";
import type { FactRow } from "@/lib/services/kb-service";

function roleFact(updatedAt: string): FactRow {
  return {
    id: "r1", category: "identity", key: "role", value: { role: "chef" },
    updatedAt, createdAt: updatedAt, confidence: 1.0,
    archivedAt: null, source: "user", parentFactId: null,
    sortOrder: 0, sessionId: "s1", visibility: "proposed",
  } as FactRow;
}

describe("shouldRedetectArchetype", () => {
  it("returns true when no archetype cached", () => {
    expect(shouldRedetectArchetype({}, [])).toBe(true);
  });

  it("returns true when TTL (14 days) expired", () => {
    const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldRedetectArchetype({ archetype: "developer", archetypeDetectedAt: old }, [])).toBe(true);
  });

  it("returns false when TTL not expired and no role change", () => {
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const oldRole = roleFact(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    expect(shouldRedetectArchetype({ archetype: "developer", archetypeDetectedAt: recent }, [oldRole])).toBe(false);
  });

  it("returns true when identity/role updated after archetypeDetectedAt", () => {
    const detectedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const roleUpdatedAfter = roleFact(new Date().toISOString()); // updated NOW
    expect(shouldRedetectArchetype({ archetype: "developer", archetypeDetectedAt: detectedAt }, [roleUpdatedAfter])).toBe(true);
  });

  it("role updated after detectedAt triggers re-detection", () => {
    const detectedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const roleNew: FactRow = { ...roleFact(new Date().toISOString()), key: "role" };
    const titleOld: FactRow = {
      ...roleFact(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()),
      key: "title", id: "t1",
    };
    expect(shouldRedetectArchetype(
      { archetype: "developer", archetypeDetectedAt: detectedAt },
      [titleOld, roleNew]
    )).toBe(true);
  });

  it("title updated after detectedAt triggers re-detection even when role is older", () => {
    const detectedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const roleOld: FactRow = { ...roleFact(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()), key: "role" };
    const titleNew: FactRow = { ...roleFact(new Date().toISOString()), key: "title", id: "t1" };
    expect(shouldRedetectArchetype(
      { archetype: "developer", archetypeDetectedAt: detectedAt },
      [roleOld, titleNew]
    )).toBe(true);
  });
});
