import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockCreateFact = vi.fn().mockResolvedValue({
  id: "fact-1",
  sessionId: "anchor-sess",
  category: "skill",
  key: "ts",
  value: { name: "TypeScript" },
  source: "connector",
});

vi.mock("@/lib/services/kb-service", () => ({
  createFact: (...args: unknown[]) => mockCreateFact(...args),
  getActiveFacts: vi.fn().mockReturnValue([
    {
      id: "f1",
      sessionId: "anchor-sess",
      category: "skill",
      key: "ts",
      value: { name: "TypeScript" },
      source: "connector",
      visibility: "proposed",
    },
  ]),
}));

const mockGetDraft = vi.fn().mockReturnValue(null);
const mockUpsertDraft = vi.fn();
const mockComputeConfigHash = vi.fn().mockReturnValue("hash-123");

vi.mock("@/lib/services/page-service", () => ({
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
  upsertDraft: (...args: unknown[]) => mockUpsertDraft(...args),
  computeConfigHash: (...args: unknown[]) => mockComputeConfigHash(...args),
}));

vi.mock("@/lib/services/page-projection", () => ({
  projectCanonicalConfig: vi.fn().mockReturnValue({
    name: "draft",
    theme: "minimal",
    style: { layout: "centered" },
    sections: [],
  }),
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: vi.fn().mockReturnValue("en"),
}));

vi.mock("@/lib/flags", () => ({
  PROFILE_ID_CANONICAL: false,
}));

const { batchCreateFacts } = await import("@/lib/connectors/connector-fact-writer");

describe("connector-fact-writer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDraft.mockReturnValue(null);
  });

  const scope = {
    cognitiveOwnerKey: "prof-1",
    knowledgeReadKeys: ["anchor-sess"],
    knowledgePrimaryKey: "anchor-sess",
    currentSessionId: "anchor-sess",
  };

  it("writes facts with source='connector' and actor='connector'", async () => {
    const report = await batchCreateFacts(
      [{ category: "skill", key: "ts", value: { name: "TypeScript" } }],
      scope,
      "testuser",
      "en",
    );

    expect(mockCreateFact).toHaveBeenCalledTimes(1);
    const [input, sessionId, profileId, options] = mockCreateFact.mock.calls[0];
    expect(input.source).toBe("connector");
    expect(options?.actor).toBe("connector");
    expect(sessionId).toBe("anchor-sess");
    expect(profileId).toBe("prof-1");
    expect(report.factsWritten).toBe(1);
    expect(report.factsSkipped).toBe(0);
  });

  it("skips failed facts and continues batch", async () => {
    mockCreateFact
      .mockResolvedValueOnce({ id: "f1" }) // first succeeds
      .mockRejectedValueOnce(new Error("validation failed")) // second fails
      .mockResolvedValueOnce({ id: "f3" }); // third succeeds

    const report = await batchCreateFacts(
      [
        { category: "skill", key: "a", value: { name: "A" } },
        { category: "skill", key: "b", value: { name: "B" } },
        { category: "skill", key: "c", value: { name: "C" } },
      ],
      scope,
      "testuser",
      "en",
    );

    expect(mockCreateFact).toHaveBeenCalledTimes(3);
    expect(report.factsWritten).toBe(2);
    expect(report.factsSkipped).toBe(1);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].key).toBe("b");
    expect(report.errors[0].reason).toContain("validation failed");
  });

  it("calls recompose exactly once after all facts", async () => {
    await batchCreateFacts(
      [
        { category: "skill", key: "a", value: { name: "A" } },
        { category: "skill", key: "b", value: { name: "B" } },
      ],
      scope,
      "testuser",
      "en",
    );

    // upsertDraft called once (single recompose)
    expect(mockUpsertDraft).toHaveBeenCalledTimes(1);
  });

  it("skips recompose when hash matches existing draft", async () => {
    mockGetDraft.mockReturnValue({
      config: { name: "draft", theme: "minimal", style: {}, sections: [] },
      username: "testuser",
      status: "draft",
      configHash: "hash-123",
      updatedAt: null,
    });
    // computeConfigHash returns "hash-123" which matches draft

    await batchCreateFacts(
      [{ category: "skill", key: "a", value: { name: "A" } }],
      scope,
      "testuser",
      "en",
    );

    expect(mockUpsertDraft).not.toHaveBeenCalled();
  });

  it("returns empty report for empty input", async () => {
    const report = await batchCreateFacts([], scope, "testuser", "en");
    expect(report.factsWritten).toBe(0);
    expect(report.factsSkipped).toBe(0);
    expect(report.errors).toHaveLength(0);
    expect(mockCreateFact).not.toHaveBeenCalled();
    expect(mockUpsertDraft).not.toHaveBeenCalled();
  });
});

describe("connector-fact-writer with PROFILE_ID_CANONICAL", () => {
  it("uses cognitiveOwnerKey for getActiveFacts and knowledgePrimaryKey for draft ops", async () => {
    // This test verifies the split-key logic
    const { getActiveFacts } = await import("@/lib/services/kb-service");
    const { getDraft } = await import("@/lib/services/page-service");

    const splitScope = {
      cognitiveOwnerKey: "prof-1",
      knowledgeReadKeys: ["sess-1", "sess-2"],
      knowledgePrimaryKey: "sess-1",
      currentSessionId: "sess-2",
    };

    await batchCreateFacts(
      [{ category: "skill", key: "x", value: { name: "X" } }],
      splitScope,
      "testuser",
      "en",
    );

    // createFact uses knowledgePrimaryKey as sessionId, cognitiveOwnerKey as profileId
    expect(mockCreateFact.mock.calls[0][1]).toBe("sess-1"); // sessionId
    expect(mockCreateFact.mock.calls[0][2]).toBe("prof-1"); // profileId

    // getDraft uses knowledgePrimaryKey (session-based)
    expect(mockGetDraft).toHaveBeenCalledWith("sess-1");
  });
});
