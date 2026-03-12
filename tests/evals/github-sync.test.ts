import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all dependencies BEFORE importing the module under test ─────

const mockGetConnectorWithCredentials = vi.fn();
const mockUpdateConnectorStatus = vi.fn();
vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorWithCredentials: (...args: any[]) =>
    mockGetConnectorWithCredentials(...args),
  updateConnectorStatus: (...args: any[]) =>
    mockUpdateConnectorStatus(...args),
}));

const mockBatchCreateFacts = vi
  .fn()
  .mockResolvedValue({ factsWritten: 5, factsSkipped: 0, errors: [] });
vi.mock("@/lib/connectors/connector-fact-writer", () => ({
  batchCreateFacts: (...args: any[]) => mockBatchCreateFacts(...args),
}));

const mockBatchRecordEvents = vi
  .fn()
  .mockResolvedValue({ eventsWritten: 0, eventsSkipped: 0, errors: [] });
vi.mock("@/lib/connectors/connector-event-writer", () => ({
  batchRecordEvents: (...args: any[]) => mockBatchRecordEvents(...args),
}));

const mockResolveOwnerScopeForWorker = vi.fn().mockReturnValue({
  cognitiveOwnerKey: "owner-1",
  knowledgeReadKeys: ["sess-1"],
  knowledgePrimaryKey: "sess-1",
  currentSessionId: "sess-1",
});
vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: (...args: any[]) =>
    mockResolveOwnerScopeForWorker(...args),
}));

const mockGetDraft = vi.fn().mockReturnValue(null);
vi.mock("@/lib/services/page-service", () => ({
  getDraft: (...args: any[]) => mockGetDraft(...args),
}));

const mockGetFactLanguage = vi.fn().mockReturnValue("en");
vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: (...args: any[]) => mockGetFactLanguage(...args),
}));

const mockFetchProfile = vi.fn();
const mockFetchRepos = vi.fn();
const mockFetchRepoLanguages = vi.fn();

class MockGitHubAuthError extends Error {
  constructor() {
    super("GitHub token expired or revoked");
    this.name = "GitHubAuthError";
  }
}

const mockFetchUserEvents = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/connectors/github/client", () => ({
  fetchProfile: (...args: any[]) => mockFetchProfile(...args),
  fetchRepos: (...args: any[]) => mockFetchRepos(...args),
  fetchRepoLanguages: (...args: any[]) => mockFetchRepoLanguages(...args),
  fetchUserEvents: (...args: any[]) => mockFetchUserEvents(...args),
  GitHubAuthError: MockGitHubAuthError,
}));

vi.mock("@/lib/connectors/github/activity", () => ({
  filterSignificantEvents: vi.fn(() => []),
  mapToEpisodicEvents: vi.fn(() => []),
}));

vi.mock("@/lib/services/episodic-service", () => ({
  insertEvent: vi.fn(),
}));

// Mock DB operations
const mockInsertRun = vi.fn();
const mockOnConflictDoUpdate = vi
  .fn()
  .mockReturnValue({ run: mockInsertRun });
const mockInsertValues = vi
  .fn()
  .mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
const mockDbInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

const mockUpdateWhere = vi.fn().mockReturnValue({ run: vi.fn() });
const mockUpdateSet = vi
  .fn()
  .mockReturnValue({ where: mockUpdateWhere });
const mockDbUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

const mockSelectAll = vi.fn().mockReturnValue([]);
const mockSelectWhere = vi.fn().mockReturnValue({ all: mockSelectAll });
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
const mockDbSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: any[]) => mockDbInsert(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
    select: (...args: any[]) => mockDbSelect(...args),
  },
  sqlite: {},
}));

vi.mock("@/lib/db/schema", () => ({
  connectors: { id: "id" },
  connectorItems: {
    connectorId: "connector_id",
    externalId: "external_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ field: a, value: b })),
}));

// ── Import module under test ─────────────────────────────────────────

const { syncGitHub } = await import("@/lib/connectors/github/sync");

// ── Sample data ──────────────────────────────────────────────────────

const sampleProfile = {
  login: "octocat",
  html_url: "https://github.com/octocat",
  bio: "I love coding",
  company: null,
  location: null,
  blog: null,
  twitter_username: null,
  name: "The Octocat",
};

const sampleRepos = [
  {
    node_id: "R1",
    name: "repo1",
    full_name: "octocat/repo1",
    description: "A repo",
    html_url: "https://github.com/octocat/repo1",
    language: "TypeScript",
    archived: false,
    fork: false,
    pushed_at: "2024-03-15T00:00:00Z",
    stargazers_count: 10,
  },
  {
    node_id: "R2",
    name: "repo2-fork",
    full_name: "octocat/repo2-fork",
    description: "A forked repo",
    html_url: "https://github.com/octocat/repo2-fork",
    language: "JavaScript",
    archived: false,
    fork: true,
    pushed_at: "2024-02-10T00:00:00Z",
    stargazers_count: 0,
  },
];

// ── Tests ────────────────────────────────────────────────────────────

describe("syncGitHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default return values after clearAllMocks
    mockBatchCreateFacts.mockResolvedValue({
      factsWritten: 5,
      factsSkipped: 0,
      errors: [],
    });
    mockResolveOwnerScopeForWorker.mockReturnValue({
      cognitiveOwnerKey: "owner-1",
      knowledgeReadKeys: ["sess-1"],
      knowledgePrimaryKey: "sess-1",
      currentSessionId: "sess-1",
    });
    mockGetDraft.mockReturnValue(null);
    mockGetFactLanguage.mockReturnValue("en");
    mockBatchRecordEvents.mockResolvedValue({
      eventsWritten: 0,
      eventsSkipped: 0,
      errors: [],
    });
    mockDbInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockReturnValue({
      onConflictDoUpdate: mockOnConflictDoUpdate,
    });
    mockOnConflictDoUpdate.mockReturnValue({ run: mockInsertRun });
    mockDbUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ run: vi.fn() });
    mockDbSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ all: mockSelectAll });
    mockSelectAll.mockReturnValue([]);
  });

  it("returns error when no credentials found", async () => {
    mockGetConnectorWithCredentials.mockReturnValue(null);

    const result = await syncGitHub("conn-1", "owner-1");

    expect(result).toEqual({
      factsCreated: 0,
      factsUpdated: 0,
      eventsCreated: 0,
      error: "No credentials",
    });
    expect(mockFetchProfile).not.toHaveBeenCalled();
  });

  it("returns error when credentials lack decryptedCredentials", async () => {
    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      decryptedCredentials: null,
    });

    const result = await syncGitHub("conn-1", "owner-1");

    expect(result).toEqual({
      factsCreated: 0,
      factsUpdated: 0,
      eventsCreated: 0,
      error: "No credentials",
    });
  });

  it("fetches profile + repos, maps, and writes via batchCreateFacts", async () => {
    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      decryptedCredentials: { access_token: "ghp_test123" },
    });
    mockFetchProfile.mockResolvedValue(sampleProfile);
    mockFetchRepos.mockResolvedValue(sampleRepos);
    mockFetchRepoLanguages.mockResolvedValue({ TypeScript: 5000 });

    const result = await syncGitHub("conn-1", "owner-1");

    expect(mockFetchProfile).toHaveBeenCalledWith("ghp_test123");
    expect(mockFetchRepos).toHaveBeenCalledWith("ghp_test123");
    expect(mockBatchCreateFacts).toHaveBeenCalledTimes(1);
    expect(result.factsCreated).toBe(5);
    expect(result.factsUpdated).toBe(0);
    expect(result.eventsCreated).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("falls back to profile.login as username when no draft exists", async () => {
    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      decryptedCredentials: { access_token: "ghp_test123" },
    });
    mockFetchProfile.mockResolvedValue(sampleProfile);
    mockFetchRepos.mockResolvedValue(sampleRepos);
    mockFetchRepoLanguages.mockResolvedValue({});
    mockGetDraft.mockReturnValue(null);

    await syncGitHub("conn-1", "owner-1");

    // batchCreateFacts should be called with profile.login as username
    const [, , username] = mockBatchCreateFacts.mock.calls[0];
    expect(username).toBe("octocat");
  });

  it("uses existing draft username when available", async () => {
    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      decryptedCredentials: { access_token: "ghp_test123" },
    });
    mockFetchProfile.mockResolvedValue(sampleProfile);
    mockFetchRepos.mockResolvedValue(sampleRepos);
    mockFetchRepoLanguages.mockResolvedValue({});
    mockGetDraft.mockReturnValue({ username: "my-custom-name", config: {} });

    await syncGitHub("conn-1", "owner-1");

    const [, , username] = mockBatchCreateFacts.mock.calls[0];
    expect(username).toBe("my-custom-name");
  });

  it("records provenance in connector_items for each non-fork repo", async () => {
    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      decryptedCredentials: { access_token: "ghp_test123" },
    });
    mockFetchProfile.mockResolvedValue(sampleProfile);
    mockFetchRepos.mockResolvedValue(sampleRepos);
    mockFetchRepoLanguages.mockResolvedValue({});

    await syncGitHub("conn-1", "owner-1");

    // Only non-fork repos (1 of 2) should trigger a db.insert
    const nonForkRepos = sampleRepos.filter((r) => !r.fork);
    expect(mockDbInsert).toHaveBeenCalledTimes(nonForkRepos.length);
    expect(mockInsertValues).toHaveBeenCalledTimes(nonForkRepos.length);

    // Check the values of the first insert
    const firstInsertArg = mockInsertValues.mock.calls[0][0];
    expect(firstInsertArg).toMatchObject({
      connectorId: "conn-1",
      externalId: "R1",
      externalHash: "2024-03-15T00:00:00Z",
      factId: null,
    });
    expect(firstInsertArg.id).toBeDefined();
  });

  it("updates lastSync + syncCursor on connectors table after success", async () => {
    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      decryptedCredentials: { access_token: "ghp_test123" },
    });
    mockFetchProfile.mockResolvedValue(sampleProfile);
    mockFetchRepos.mockResolvedValue(sampleRepos);
    mockFetchRepoLanguages.mockResolvedValue({});

    await syncGitHub("conn-1", "owner-1");

    // db.update should be called at least once for the connectors table
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalled();

    const setArg = mockUpdateSet.mock.calls[0][0];
    expect(setArg.lastSync).toBeDefined();
    // syncCursor is now JSON with repoCursor + optional lastEventId
    const cursor = JSON.parse(setArg.syncCursor);
    expect(cursor.repoCursor).toBe("2024-03-15T00:00:00Z"); // latest pushed_at among non-fork
    expect(setArg.updatedAt).toBeDefined();
  });

  it("handles GitHubAuthError — updates connector status and returns error", async () => {
    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      decryptedCredentials: { access_token: "ghp_expired" },
    });
    mockFetchProfile.mockRejectedValue(new MockGitHubAuthError());

    const result = await syncGitHub("conn-1", "owner-1");

    expect(mockUpdateConnectorStatus).toHaveBeenCalledWith(
      "conn-1",
      "error",
      "Token expired or revoked",
    );
    expect(result).toEqual({
      factsCreated: 0,
      factsUpdated: 0,
      eventsCreated: 0,
      error: "Token expired or revoked — reconnect required",
    });
  });

  it("rethrows non-auth errors", async () => {
    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      decryptedCredentials: { access_token: "ghp_test123" },
    });
    mockFetchProfile.mockRejectedValue(new Error("Network failure"));

    await expect(syncGitHub("conn-1", "owner-1")).rejects.toThrow(
      "Network failure",
    );
  });

  it("handles string-encoded decryptedCredentials", async () => {
    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      decryptedCredentials: JSON.stringify({ access_token: "ghp_str" }),
    });
    mockFetchProfile.mockResolvedValue(sampleProfile);
    mockFetchRepos.mockResolvedValue([]);
    mockFetchRepoLanguages.mockResolvedValue({});

    const result = await syncGitHub("conn-1", "owner-1");

    expect(mockFetchProfile).toHaveBeenCalledWith("ghp_str");
    expect(result.error).toBeUndefined();
  });

  it("fetches languages only for non-fork repos limited to 30", async () => {
    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      decryptedCredentials: { access_token: "ghp_test123" },
    });
    mockFetchProfile.mockResolvedValue(sampleProfile);

    // Create 35 non-fork repos
    const manyRepos = Array.from({ length: 35 }, (_, i) => ({
      node_id: `R${i}`,
      name: `repo${i}`,
      full_name: `octocat/repo${i}`,
      description: null,
      html_url: `https://github.com/octocat/repo${i}`,
      language: "TypeScript",
      archived: false,
      fork: false,
      pushed_at: "2024-01-01T00:00:00Z",
      stargazers_count: 0,
    }));
    mockFetchRepos.mockResolvedValue(manyRepos);
    mockFetchRepoLanguages.mockResolvedValue({ TypeScript: 1000 });

    await syncGitHub("conn-1", "owner-1");

    // Should only fetch languages for 30 repos (the limit)
    expect(mockFetchRepoLanguages).toHaveBeenCalledTimes(30);
  });

  // ── Episodic event tests ────────────────────────────────────────────

  it("first sync is baseline — no episodic events", async () => {
    // Connector with no lastSync = first sync
    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      lastSync: null,
      decryptedCredentials: { access_token: "ghp_test123" },
    });
    mockFetchProfile.mockResolvedValue(sampleProfile);
    mockFetchRepos.mockResolvedValue(sampleRepos);
    mockFetchRepoLanguages.mockResolvedValue({ TypeScript: 5000 });

    const result = await syncGitHub("conn-1", "owner-1");

    // First sync = baseline: no events emitted
    expect(result.eventsCreated).toBe(0);
    expect(mockBatchRecordEvents).not.toHaveBeenCalled();
  });

  it("subsequent sync creates episodic events for truly new repos", async () => {
    // Connector with lastSync set = subsequent sync
    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      lastSync: "2026-03-10T00:00:00Z",
      decryptedCredentials: { access_token: "ghp_test123" },
    });
    mockFetchProfile.mockResolvedValue(sampleProfile);
    mockFetchRepos.mockResolvedValue(sampleRepos);
    mockFetchRepoLanguages.mockResolvedValue({ TypeScript: 5000 });

    // R1 already exists in connector_items, R2 is a fork (excluded)
    mockSelectAll.mockReturnValue([
      { externalId: "R1", connectorId: "conn-1" },
    ]);

    mockBatchRecordEvents.mockResolvedValue({
      eventsWritten: 0,
      eventsSkipped: 0,
      errors: [],
    });

    const result = await syncGitHub("conn-1", "owner-1");

    // R1 is already known, R2 is a fork → no new non-fork repos → no events
    expect(result.eventsCreated).toBe(0);
    // batchRecordEvents should not be called when there are no new repos
    expect(mockBatchRecordEvents).not.toHaveBeenCalled();
  });

  it("subsequent sync emits events for new non-fork repos only", async () => {
    const reposWithNew = [
      ...sampleRepos,
      {
        node_id: "R3",
        name: "new-project",
        full_name: "octocat/new-project",
        description: "A brand new project",
        html_url: "https://github.com/octocat/new-project",
        language: "Rust",
        archived: false,
        fork: false,
        pushed_at: "2026-03-11T12:00:00Z",
        stargazers_count: 0,
      },
    ];

    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      lastSync: "2026-03-10T00:00:00Z",
      decryptedCredentials: { access_token: "ghp_test123" },
    });
    mockFetchProfile.mockResolvedValue(sampleProfile);
    mockFetchRepos.mockResolvedValue(reposWithNew);
    mockFetchRepoLanguages.mockResolvedValue({ TypeScript: 5000 });

    // R1 already exists; R2 is a fork; R3 is truly new
    mockSelectAll.mockReturnValue([
      { externalId: "R1", connectorId: "conn-1" },
    ]);

    mockBatchRecordEvents.mockResolvedValue({
      eventsWritten: 1,
      eventsSkipped: 0,
      errors: [],
    });

    const result = await syncGitHub("conn-1", "owner-1");

    expect(result.eventsCreated).toBe(1);
    expect(mockBatchRecordEvents).toHaveBeenCalledOnce();

    const [events, ctx] = mockBatchRecordEvents.mock.calls[0];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      externalId: "repo-R3",
      actionType: "work",
      narrativeSummary: "Created new repository: new-project — A brand new project",
    });
    expect(events[0].eventAtUnix).toBeTypeOf("number");
    expect(events[0].entities).toBeDefined();

    expect(ctx).toMatchObject({
      ownerKey: "owner-1",
      connectorId: "conn-1",
      connectorType: "github",
      sessionId: "sess-1",
    });
  });

  it("subsequent sync handles repos without description", async () => {
    const reposNoDesc = [
      {
        node_id: "R4",
        name: "no-desc-repo",
        full_name: "octocat/no-desc-repo",
        description: null,
        html_url: "https://github.com/octocat/no-desc-repo",
        language: "Go",
        archived: false,
        fork: false,
        pushed_at: "2026-03-11T12:00:00Z",
        stargazers_count: 0,
      },
    ];

    mockGetConnectorWithCredentials.mockReturnValue({
      id: "conn-1",
      lastSync: "2026-03-10T00:00:00Z",
      decryptedCredentials: { access_token: "ghp_test123" },
    });
    mockFetchProfile.mockResolvedValue(sampleProfile);
    mockFetchRepos.mockResolvedValue(reposNoDesc);
    mockFetchRepoLanguages.mockResolvedValue({ Go: 3000 });

    // No existing items → R4 is new
    mockSelectAll.mockReturnValue([]);

    mockBatchRecordEvents.mockResolvedValue({
      eventsWritten: 1,
      eventsSkipped: 0,
      errors: [],
    });

    const result = await syncGitHub("conn-1", "owner-1");

    expect(result.eventsCreated).toBe(1);
    const [events] = mockBatchRecordEvents.mock.calls[0];
    // No description → no " — " suffix
    expect(events[0].narrativeSummary).toBe(
      "Created new repository: no-desc-repo",
    );
    expect(events[0].entities).toEqual(["Go"]);
  });
});
