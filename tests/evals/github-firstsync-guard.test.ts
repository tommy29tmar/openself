import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

// Mock all external dependencies
vi.mock("@/lib/connectors/github/client", () => ({
  fetchProfile: vi.fn().mockResolvedValue({ login: "user", id: 1, name: "Test User", bio: null, avatar_url: "https://example.com/avatar.png" }),
  fetchRepos: vi.fn().mockResolvedValue([]),
  fetchRepoLanguages: vi.fn().mockResolvedValue({}),
  fetchUserEvents: vi.fn().mockResolvedValue([
    {
      id: "evt-1",
      type: "CreateEvent",
      created_at: "2026-03-12T00:00:00Z",
      repo: { name: "user/repo" },
      payload: { ref_type: "repository" },
    },
  ]),
  GitHubAuthError: class extends Error {},
}));
vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorWithCredentials: vi.fn().mockReturnValue({
    id: "c1",
    lastSync: null,
    syncCursor: null,
    decryptedCredentials: { access_token: "tok" },
  }),
  updateConnectorStatus: vi.fn(),
}));
vi.mock("@/lib/services/episodic-service", () => ({
  insertEvent: vi.fn(),
}));
vi.mock("@/lib/connectors/connector-event-writer", () => ({
  batchRecordEvents: vi.fn().mockResolvedValue({ eventsWritten: 0, eventsSkipped: 0, errors: [] }),
}));
vi.mock("@/lib/connectors/connector-fact-writer", () => ({
  batchCreateFacts: vi.fn().mockResolvedValue({ factsWritten: 0, factsSkipped: 0 }),
}));
vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: vi.fn().mockReturnValue({
    cognitiveOwnerKey: "owner1",
    knowledgePrimaryKey: "owner1",
    knowledgeReadKeys: ["owner1"],
  }),
}));
vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: vi.fn().mockReturnValue("en"),
}));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: vi.fn().mockReturnValue(null),
}));

import { insertEvent } from "@/lib/services/episodic-service";
import { getConnectorWithCredentials } from "@/lib/connectors/connector-service";

const CONNECTOR_ID = `test-gh-guard-${randomUUID()}`;

afterAll(() => {
  try { sqlite.prepare("DELETE FROM connectors WHERE id LIKE 'test-gh-guard-%'").run(); } catch {}
});

describe("GitHub first-sync guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should NOT write episodic events on first sync (no lastEventId)", async () => {
    const { syncGitHub } = await import("@/lib/connectors/github/sync");
    await syncGitHub(CONNECTOR_ID, "owner1");
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("should NOT write episodic events for legacy connectors (lastSync set but no lastEventId)", async () => {
    vi.mocked(getConnectorWithCredentials).mockReturnValueOnce({
      id: "c-legacy",
      lastSync: "2026-03-01T00:00:00Z",
      syncCursor: JSON.stringify({ repoCursor: "2026-03-01T00:00:00Z" }),
      decryptedCredentials: { access_token: "tok" },
    } as any);

    const { syncGitHub } = await import("@/lib/connectors/github/sync");
    await syncGitHub("c-legacy", "owner1");
    expect(insertEvent).not.toHaveBeenCalled();
  });
});
