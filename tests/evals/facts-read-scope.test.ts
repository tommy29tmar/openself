import { describe, it, expect, vi, afterEach } from "vitest";
import type { OwnerScope } from "@/lib/auth/session";

const SCOPE: OwnerScope = {
  cognitiveOwnerKey: "profile-1",
  knowledgeReadKeys: ["sess-a", "sess-b"],
  knowledgePrimaryKey: "sess-a",
  currentSessionId: "sess-b",
};

afterEach(() => {
  vi.resetModules();
  vi.unmock("@/lib/flags");
});

describe("getFactsReadScope", () => {
  it("uses knowledgePrimaryKey + readKeys when PROFILE_ID_CANONICAL=false", async () => {
    vi.doMock("@/lib/flags", () => ({ PROFILE_ID_CANONICAL: false }));
    const { getFactsReadScope } = await import("@/lib/agent/facts-read-scope");

    expect(getFactsReadScope(SCOPE)).toEqual({
      factsReadId: "sess-a",
      factsReadKeys: ["sess-a", "sess-b"],
    });
  });

  it("uses cognitiveOwnerKey and omits readKeys when PROFILE_ID_CANONICAL=true", async () => {
    vi.doMock("@/lib/flags", () => ({ PROFILE_ID_CANONICAL: true }));
    const { getFactsReadScope } = await import("@/lib/agent/facts-read-scope");

    expect(getFactsReadScope(SCOPE)).toEqual({
      factsReadId: "profile-1",
      factsReadKeys: undefined,
    });
  });
});
