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

vi.mock("@/lib/connectors/github/client", () => ({
  fetchProfile: (...args: any[]) => mockFetchProfile(...args),
  fetchRepos: (...args: any[]) => mockFetchRepos(...args),
  fetchRepoLanguages: (...args: any[]) => mockFetchRepoLanguages(...args),
  GitHubAuthError: MockGitHubAuthError,
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

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: any[]) => mockDbInsert(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
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
    mockDbInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockReturnValue({
      onConflictDoUpdate: mockOnConflictDoUpdate,
    });
    mockOnConflictDoUpdate.mockReturnValue({ run: mockInsertRun });
    mockDbUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ run: vi.fn() });
  });

  it("returns error when no credentials found", async () => {
    mockGetConnectorWithCredentials.mockReturnValue(null);

    const result = await syncGitHub("conn-1", "owner-1");

    expect(result).toEqual({
      factsCreated: 0,
      factsUpdated: 0,
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
    expect(setArg.syncCursor).toBe("2024-03-15T00:00:00Z"); // latest pushed_at among non-fork
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
});
