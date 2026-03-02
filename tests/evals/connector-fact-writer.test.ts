import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

// Mutable flags — vi.hoisted runs before vi.mock
const { flagsMock } = vi.hoisted(() => ({
  flagsMock: { PROFILE_ID_CANONICAL: false },
}));

const mockCreateFact = vi.fn().mockResolvedValue({
  id: "fact-1",
  sessionId: "anchor-sess",
  category: "skill",
  key: "ts",
  value: { name: "TypeScript" },
  source: "connector",
});

const mockGetActiveFacts = vi.fn().mockReturnValue([
  {
    id: "f1",
    sessionId: "anchor-sess",
    category: "skill",
    key: "ts",
    value: { name: "TypeScript" },
    source: "connector",
    visibility: "proposed",
  },
]);

vi.mock("@/lib/services/kb-service", () => ({
  createFact: (...args: unknown[]) => mockCreateFact(...args),
  getActiveFacts: (...args: unknown[]) => mockGetActiveFacts(...args),
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

const mockGetFactLanguage = vi.fn().mockReturnValue("en");

vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: (...args: unknown[]) => mockGetFactLanguage(...args),
}));

vi.mock("@/lib/flags", () => flagsMock);

const { batchCreateFacts } = await import("@/lib/connectors/connector-fact-writer");

describe("connector-fact-writer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDraft.mockReturnValue(null);
    flagsMock.PROFILE_ID_CANONICAL = false;
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
    // Verify source is forced to "connector" (not default "chat")
    // This is sufficient because createFact writes input.source to DB via
    // `source: input.source ?? "chat"` (kb-service.ts:176)
    expect(input.source).toBe("connector");
    expect(options?.actor).toBe("connector");
    expect(sessionId).toBe("anchor-sess");
    expect(profileId).toBe("prof-1");
    expect(report.factsWritten).toBe(1);
    expect(report.factsSkipped).toBe(0);
  });

  it("overrides user-supplied source with 'connector'", async () => {
    // Even if input has source: "chat", the writer must force "connector"
    await batchCreateFacts(
      [{ category: "skill", key: "ts", value: { name: "TS" }, source: "chat" }],
      scope,
      "testuser",
      "en",
    );

    const [input] = mockCreateFact.mock.calls[0];
    expect(input.source).toBe("connector");
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

describe("connector-fact-writer split-key logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDraft.mockReturnValue(null);
    flagsMock.PROFILE_ID_CANONICAL = false;
  });

  const splitScope = {
    cognitiveOwnerKey: "prof-1",
    knowledgeReadKeys: ["sess-1", "sess-2"],
    knowledgePrimaryKey: "sess-1",
    currentSessionId: "sess-2",
  };

  it("uses knowledgePrimaryKey for createFact sessionId and getDraft", async () => {
    await batchCreateFacts(
      [{ category: "skill", key: "x", value: { name: "X" } }],
      splitScope,
      "testuser",
      "en",
    );

    // createFact: sessionId = knowledgePrimaryKey, profileId = cognitiveOwnerKey
    expect(mockCreateFact.mock.calls[0][1]).toBe("sess-1");
    expect(mockCreateFact.mock.calls[0][2]).toBe("prof-1");
    // getDraft: session-based, always knowledgePrimaryKey
    expect(mockGetDraft).toHaveBeenCalledWith("sess-1");
    // getFactLanguage: session-based
    expect(mockGetFactLanguage).toHaveBeenCalledWith("sess-1");
  });

  it("PROFILE_ID_CANONICAL=false: getActiveFacts uses knowledgePrimaryKey + readKeys", async () => {
    flagsMock.PROFILE_ID_CANONICAL = false;

    await batchCreateFacts(
      [{ category: "skill", key: "x", value: { name: "X" } }],
      splitScope,
      "testuser",
      "en",
    );

    // Non-canonical: factsReadId = knowledgePrimaryKey, passes readKeys
    expect(mockGetActiveFacts).toHaveBeenCalledWith("sess-1", ["sess-1", "sess-2"]);
  });

  it("PROFILE_ID_CANONICAL=true: getActiveFacts uses cognitiveOwnerKey, no readKeys", async () => {
    flagsMock.PROFILE_ID_CANONICAL = true;

    await batchCreateFacts(
      [{ category: "skill", key: "x", value: { name: "X" } }],
      splitScope,
      "testuser",
      "en",
    );

    // Canonical: factsReadId = cognitiveOwnerKey, readKeys = undefined
    expect(mockGetActiveFacts).toHaveBeenCalledWith("prof-1", undefined);
    // But getDraft still uses knowledgePrimaryKey (session-based)
    expect(mockGetDraft).toHaveBeenCalledWith("sess-1");
  });
});
