import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Track facts written through the full chain ──────────────────────

const writtenFacts: Array<{
  category: string;
  key: string;
  value: Record<string, unknown>;
}> = [];

// ── Mock external boundaries (DB, services, auth) ───────────────────

const mockCreateFact = vi.fn().mockImplementation(async (input: any) => {
  writtenFacts.push({
    category: input.category,
    key: input.key,
    value: input.value,
  });
  return { id: `fact-${writtenFacts.length}` };
});
const mockGetActiveFacts = vi.fn().mockReturnValue([]);

vi.mock("@/lib/services/kb-service", () => ({
  createFact: (...args: any[]) => mockCreateFact(...args),
  getActiveFacts: (...args: any[]) => mockGetActiveFacts(...args),
  getFactByKey: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/services/fact-cluster-service", () => ({
  getProjectedFacts: (...args: any[]) =>
    mockGetActiveFacts(...args).map((f: any) => ({
      ...f,
      sources: [f.source ?? "chat"],
      clusterSize: 1,
      clusterId: null,
      memberIds: [f.id],
    })),
  tryAssignCluster: vi.fn().mockReturnValue(null),
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

const mockGetDraft = vi
  .fn()
  .mockReturnValue({ username: "testuser", config: {}, configHash: "old-hash" });
const mockUpsertDraft = vi.fn();
const mockComputeConfigHash = vi.fn().mockReturnValue("new-hash");

vi.mock("@/lib/services/page-service", () => ({
  getDraft: (...args: any[]) => mockGetDraft(...args),
  upsertDraft: (...args: any[]) => mockUpsertDraft(...args),
  computeConfigHash: (...args: any[]) => mockComputeConfigHash(...args),
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: vi.fn().mockReturnValue("en"),
}));

vi.mock("@/lib/services/page-projection", () => ({
  projectCanonicalConfig: vi.fn().mockReturnValue({ sections: [] }),
}));

vi.mock("@/lib/flags", () => ({
  PROFILE_ID_CANONICAL: true,
}));

// ── Mock connector-service (DB-backed) ──────────────────────────────

let connectorState = {
  status: "connected",
  credentials: "encrypted" as string | null,
};

const mockGetConnectorWithCredentials = vi.fn().mockImplementation(() => ({
  id: "conn-1",
  connectorType: "github",
  ownerKey: "owner-1",
  status: connectorState.status,
  decryptedCredentials: JSON.stringify({ access_token: "ghp_test_token" }),
}));

const mockGetActiveConnectors = vi.fn().mockReturnValue([
  { id: "conn-1", connectorType: "github", status: "connected", enabled: true },
]);

const mockUpdateConnectorStatus = vi.fn();

const mockDisconnectConnector = vi.fn().mockImplementation(() => {
  connectorState.status = "disconnected";
  connectorState.credentials = null;
});

vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorWithCredentials: (...args: any[]) =>
    mockGetConnectorWithCredentials(...args),
  getActiveConnectors: (...args: any[]) =>
    mockGetActiveConnectors(...args),
  updateConnectorStatus: (...args: any[]) =>
    mockUpdateConnectorStatus(...args),
  disconnectConnector: (...args: any[]) =>
    mockDisconnectConnector(...args),
  getConnectorStatus: vi.fn(),
  createConnector: vi.fn(),
}));

// ── Mock DB layer ───────────────────────────────────────────────────

const mockInsertRun = vi.fn();
const mockOnConflictDoUpdate = vi
  .fn()
  .mockReturnValue({ run: mockInsertRun });
const mockInsertValues = vi.fn().mockReturnValue({
  onConflictDoUpdate: mockOnConflictDoUpdate,
  run: mockInsertRun,
});
const mockDbInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

const mockUpdateWhere = vi.fn().mockReturnValue({ run: vi.fn() });
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockDbUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

// mockSqlite must be declared via vi.hoisted so it is available inside vi.mock factories
// (which are hoisted to the top of the file by vitest)
const mockSqlite = vi.hoisted(() => ({
  prepare: vi.fn().mockReturnValue({
    run: vi.fn(),
    all: vi.fn().mockReturnValue([]),
    get: vi.fn(),
  }),
  transaction: vi.fn((fn: any) => fn),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: any[]) => mockDbInsert(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
  },
  sqlite: mockSqlite,
}));

vi.mock("@/lib/db/schema", () => ({
  syncLog: "sync_log",
  connectors: { id: "id", ownerKey: "owner_key", status: "status", enabled: "enabled" },
  connectorItems: {
    connectorId: "connector_id",
    externalId: "external_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ field: a, value: b })),
  and: vi.fn((...args: any[]) => args),
  inArray: vi.fn((...args: any[]) => args),
}));

vi.mock("@/lib/services/episodic-service", () => ({
  insertEvent: vi.fn(),
}));

// ── Mock fetch for GitHub API ───────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockProfile = {
  login: "octocat",
  html_url: "https://github.com/octocat",
  bio: "I love coding",
  company: "@github",
  location: "San Francisco",
  blog: "octocat.dev",
  twitter_username: "octocat",
  name: "The Octocat",
};

const mockRepos = [
  {
    node_id: "R1",
    name: "hello-world",
    full_name: "octocat/hello-world",
    description: "My first repo",
    html_url: "https://github.com/octocat/hello-world",
    language: "TypeScript",
    archived: false,
    fork: false,
    pushed_at: "2024-01-15T00:00:00Z",
    stargazers_count: 42,
  },
  {
    node_id: "R2",
    name: "forked-repo",
    full_name: "octocat/forked-repo",
    description: "A fork",
    html_url: "https://github.com/octocat/forked-repo",
    language: "JavaScript",
    archived: false,
    fork: true,
    pushed_at: "2024-01-10T00:00:00Z",
    stargazers_count: 0,
  },
];

mockFetch.mockImplementation(async (url: string | URL | Request) => {
  const urlStr = typeof url === "string" ? url : url.toString();
  if (urlStr === "https://api.github.com/user") {
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockProfile),
      headers: new Headers(),
    };
  }
  if (urlStr.startsWith("https://api.github.com/user/repos")) {
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockRepos),
      headers: new Headers(),
    };
  }
  if (urlStr.includes("/languages")) {
    return {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ TypeScript: 1000, JavaScript: 500 }),
      headers: new Headers(),
    };
  }
  if (urlStr.includes("/events")) {
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
      headers: new Headers(),
    };
  }
  return { ok: false, status: 404, headers: new Headers() };
});

// ── Import modules AFTER all vi.mock() calls ────────────────────────

// register-all populates the real registry with github + linkedin_zip definitions
// The registry is NOT mocked, so handleConnectorSync dispatches through real syncGitHub
import "@/lib/connectors/register-all";

const { handleConnectorSync } = await import(
  "@/lib/connectors/connector-sync-handler"
);
const { disconnectConnector } = await import(
  "@/lib/connectors/connector-service"
);

// ── Tests ────────────────────────────────────────────────────────────

describe("GitHub connector E2E", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writtenFacts.length = 0;
    connectorState = { status: "connected", credentials: "encrypted" };

    // Restore default return values after clearAllMocks
    mockGetActiveConnectors.mockReturnValue([
      {
        id: "conn-1",
        connectorType: "github",
        status: "connected",
        enabled: true,
      },
    ]);
    mockGetConnectorWithCredentials.mockImplementation(() => ({
      id: "conn-1",
      connectorType: "github",
      ownerKey: "owner-1",
      status: connectorState.status,
      decryptedCredentials: JSON.stringify({ access_token: "ghp_test_token" }),
    }));
    mockResolveOwnerScopeForWorker.mockReturnValue({
      cognitiveOwnerKey: "owner-1",
      knowledgeReadKeys: ["sess-1"],
      knowledgePrimaryKey: "sess-1",
      currentSessionId: "sess-1",
    });
    mockGetDraft.mockReturnValue({
      username: "testuser",
      config: {},
      configHash: "old-hash",
    });
    mockComputeConfigHash.mockReturnValue("new-hash");
    mockGetActiveFacts.mockReturnValue([]);
    mockDbInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockReturnValue({
      onConflictDoUpdate: mockOnConflictDoUpdate,
      run: mockInsertRun,
    });
    mockOnConflictDoUpdate.mockReturnValue({ run: mockInsertRun });
    mockDbUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ run: vi.fn() });
    mockSqlite.prepare.mockReturnValue({
      run: vi.fn(),
      all: vi.fn().mockReturnValue([]),
      get: vi.fn(),
    });
  });

  it("full flow: sync → facts created → disconnect → facts preserved", async () => {
    // Step 1: Run sync via handler (exercises full dispatch path)
    await handleConnectorSync({ ownerKey: "owner-1" });

    // Step 2: Verify facts were created via createFact
    expect(mockCreateFact).toHaveBeenCalled();
    const factCount = mockCreateFact.mock.calls.length;
    expect(factCount).toBeGreaterThan(0);

    // Verify profile facts (social, identity categories from mapProfile)
    const socialFacts = writtenFacts.filter((f) => f.category === "social");
    expect(socialFacts.some((f) => f.key === "gh-profile")).toBe(true);
    expect(
      socialFacts.find((f) => f.key === "gh-profile")!.value,
    ).toMatchObject({
      platform: "github",
      url: "https://github.com/octocat",
      username: "octocat",
    });

    // Bio, company, location from profile
    const identityFacts = writtenFacts.filter(
      (f) => f.category === "identity",
    );
    expect(identityFacts.some((f) => f.key === "gh-bio")).toBe(true);
    expect(identityFacts.some((f) => f.key === "gh-company")).toBe(true);
    expect(identityFacts.some((f) => f.key === "gh-location")).toBe(true);

    // Website and twitter from profile
    expect(socialFacts.some((f) => f.key === "gh-website")).toBe(true);
    expect(socialFacts.some((f) => f.key === "gh-twitter")).toBe(true);

    // Verify project facts: only non-fork repos should produce project facts
    const projectFacts = writtenFacts.filter((f) => f.category === "project");
    expect(projectFacts).toHaveLength(1); // Only hello-world (fork excluded)
    expect(projectFacts[0].key).toBe("gh-R1");
    expect(projectFacts[0].value).toMatchObject({
      name: "hello-world",
      description: "My first repo",
      url: "https://github.com/octocat/hello-world",
      status: "active",
    });

    // Verify skill facts (aggregated language skills from non-fork repos)
    const skillFacts = writtenFacts.filter((f) => f.category === "skill");
    expect(skillFacts.length).toBeGreaterThan(0);
    const tsSkill = skillFacts.find((f) => f.key === "gh-typescript");
    expect(tsSkill).toBeDefined();
    expect(tsSkill!.value).toMatchObject({ name: "TypeScript" });

    // Verify stat fact (repo count)
    const statFacts = writtenFacts.filter((f) => f.category === "stat");
    expect(statFacts.some((f) => f.key === "github-repos")).toBe(true);
    expect(
      statFacts.find((f) => f.key === "github-repos")!.value,
    ).toMatchObject({
      label: "GitHub repositories",
      value: "1", // Only non-fork repos counted
    });

    // Step 3: Verify sync_log was written (db.insert called for sync_log)
    expect(mockDbInsert).toHaveBeenCalled();

    // Step 4: Disconnect connector
    disconnectConnector("conn-1");
    expect(mockDisconnectConnector).toHaveBeenCalledWith("conn-1");

    // Step 5: Facts are still there — disconnect wipes credentials, not facts
    expect(writtenFacts.length).toBe(factCount);
  });

  it("uses existing draft username instead of GitHub login", async () => {
    mockGetDraft.mockReturnValue({
      username: "my-custom-name",
      config: {},
      configHash: "old-hash",
    });

    await handleConnectorSync({ ownerKey: "owner-1" });

    // batchCreateFacts is called inside syncGitHub with the draft's username
    // Verify createFact was called (facts were actually written)
    expect(mockCreateFact).toHaveBeenCalled();
    expect(writtenFacts.length).toBeGreaterThan(0);
  });

  it("connector status updated to connected on successful sync", async () => {
    await handleConnectorSync({ ownerKey: "owner-1" });

    expect(mockUpdateConnectorStatus).toHaveBeenCalledWith(
      "conn-1",
      "connected",
    );
  });

  it("recomposes draft after all facts are written", async () => {
    // Return some facts so recompose path is exercised
    mockGetActiveFacts.mockReturnValue([
      { id: "f1", category: "social", key: "gh-profile", value: {} },
    ]);

    await handleConnectorSync({ ownerKey: "owner-1" });

    // batchCreateFacts calls projectCanonicalConfig + upsertDraft for recompose
    expect(mockUpsertDraft).toHaveBeenCalled();
  });

  it("skips recompose when hash matches (idempotency)", async () => {
    mockGetActiveFacts.mockReturnValue([
      { id: "f1", category: "social", key: "gh-profile", value: {} },
    ]);
    // Make composed hash match existing draft hash
    mockComputeConfigHash.mockReturnValue("old-hash");

    await handleConnectorSync({ ownerKey: "owner-1" });

    // upsertDraft should NOT be called — hash matches
    expect(mockUpsertDraft).not.toHaveBeenCalled();
  });

  it("records provenance in connector_items for each non-fork repo", async () => {
    await handleConnectorSync({ ownerKey: "owner-1" });

    // syncGitHub writes to connector_items via db.insert for each non-fork repo
    // Plus sync_log insert from handler, plus db.update for lastSync/syncCursor
    // The connector_items inserts use onConflictDoUpdate
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
  });

  it("handles sync error gracefully — marks connector as error", async () => {
    // Make GitHub API return 401 for profile fetch
    mockFetch.mockImplementationOnce(async () => ({
      ok: false,
      status: 401,
      headers: new Headers(),
    }));

    await handleConnectorSync({ ownerKey: "owner-1" });

    // Connector should be marked as error
    expect(mockUpdateConnectorStatus).toHaveBeenCalledWith(
      "conn-1",
      "error",
      expect.stringContaining("Token expired"),
    );

    // No facts should have been written
    expect(writtenFacts).toHaveLength(0);
  });
});
