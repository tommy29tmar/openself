import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetActiveFacts = vi.fn();
const mockTryAssignCluster = vi.fn();
const mockResolveOwnerScope = vi.fn().mockReturnValue({
  cognitiveOwnerKey: "prof-1",
  knowledgePrimaryKey: "anchor-sess",
  knowledgeReadKeys: ["anchor-sess"],
});
const mockLogEvent = vi.fn();

vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: (...args: any[]) => mockGetActiveFacts(...args),
}));
vi.mock("@/lib/services/fact-cluster-service", () => ({
  tryAssignCluster: (...args: any[]) => mockTryAssignCluster(...args),
}));
vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: (...args: any[]) => mockResolveOwnerScope(...args),
}));
vi.mock("@/lib/services/event-service", () => ({
  logEvent: (...args: any[]) => mockLogEvent(...args),
}));

const { handleConsolidateFacts } = await import("@/lib/worker/handlers/consolidate-facts");

describe("consolidate-facts handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires ownerKey in payload", async () => {
    await expect(handleConsolidateFacts({})).rejects.toThrow("missing ownerKey");
  });

  it("skips when no unclustered facts", async () => {
    mockGetActiveFacts.mockReturnValue([
      { id: "f1", category: "skill", key: "ts", clusterId: "c1", value: { name: "TS" }, source: "chat" },
    ]);

    await handleConsolidateFacts({ ownerKey: "prof-1" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "consolidate_facts_skip" }),
    );
  });

  it("calls tryAssignCluster for unclustered facts", async () => {
    mockGetActiveFacts.mockReturnValue([
      { id: "f1", category: "skill", key: "ts", clusterId: null, value: { name: "TypeScript" }, source: "chat" },
      { id: "f2", category: "skill", key: "gh-typescript", clusterId: null, value: { name: "TypeScript", evidence: "45 repos" }, source: "connector" },
    ]);
    mockTryAssignCluster.mockReturnValueOnce({ clusterId: "c-new", isNew: true, matchedFactId: "f1", canonicalKey: "ts" });
    mockTryAssignCluster.mockReturnValueOnce(null); // second fact already matched via first

    await handleConsolidateFacts({ ownerKey: "prof-1" });

    expect(mockTryAssignCluster).toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "consolidate_facts_complete",
        payload: expect.objectContaining({ clustersCreated: expect.any(Number) }),
      }),
    );
  });

  it("skips identity category facts", async () => {
    mockGetActiveFacts.mockReturnValue([
      { id: "f1", category: "identity", key: "name", clusterId: null, value: { name: "Tom" }, source: "chat" },
    ]);

    await handleConsolidateFacts({ ownerKey: "prof-1" });

    expect(mockTryAssignCluster).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "consolidate_facts_complete" }),
    );
  });
});
