import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  slugifyForMatch,
  identityMatch,
} from "@/lib/services/fact-cluster-service";

// ---------------------------------------------------------------------------
// Mocks for tryAssignCluster tests
// ---------------------------------------------------------------------------

const mockAll = vi.fn();
const mockGet = vi.fn();
const mockRun = vi.fn();

// Chainable mock builder
function makeChain(terminal: { all?: typeof mockAll; get?: typeof mockGet; run?: typeof mockRun }) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "set", "values"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  if (terminal.all) chain.all = terminal.all;
  if (terminal.get) chain.get = terminal.get;
  if (terminal.run) chain.run = terminal.run;
  return chain;
}

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  db: new Proxy({} as typeof mockDb, {
    get: (_: unknown, prop: string) => (mockDb as Record<string, unknown>)[prop],
  }),
  sqlite: { prepare: vi.fn(), transaction: vi.fn((fn: () => unknown) => fn) },
}));

vi.mock("@/lib/db/schema", () => ({
  facts: {
    id: "id",
    sessionId: "session_id",
    profileId: "profile_id",
    category: "category",
    key: "key",
    value: "value",
    source: "source",
    archivedAt: "archived_at",
    clusterId: "cluster_id",
  },
  factClusters: {
    id: "id",
    ownerKey: "owner_key",
    category: "category",
    canonicalKey: "canonical_key",
  },
}));

vi.mock("@/lib/flags", () => ({
  PROFILE_ID_CANONICAL: true,
}));

// ---------------------------------------------------------------------------
// slugifyForMatch
// ---------------------------------------------------------------------------

describe("slugifyForMatch", () => {
  it("normalizes accented characters", () => {
    expect(slugifyForMatch("Politécnico de Milano")).toBe(
      "politecnico-de-milano"
    );
  });

  it("normalizes case and whitespace", () => {
    expect(slugifyForMatch("  Senior Software  Engineer  ")).toBe(
      "senior-software-engineer"
    );
  });

  it("strips special characters", () => {
    expect(slugifyForMatch("C++ & C#")).toBe("c-c");
  });

  it("returns empty string for nullish input", () => {
    expect(slugifyForMatch(undefined)).toBe("");
    expect(slugifyForMatch(null)).toBe("");
    expect(slugifyForMatch("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// identityMatch
// ---------------------------------------------------------------------------

describe("identityMatch", () => {
  // education
  it("does NOT match education with different degrees", () => {
    const a = { institution: "Politecnico di Milano", degree: "Laurea", field: "Informatica" };
    const b = { institution: "Politécnico di Milano", degree: "Laurea Magistrale" };
    expect(identityMatch("education", a, b)).toBe(false);
  });

  it("matches education with same institution and degree slug", () => {
    const a = { institution: "MIT", degree: "MSc" };
    const b = { institution: "MIT", degree: "MSc", field: "Computer Science", startDate: "2015" };
    expect(identityMatch("education", a, b)).toBe(true);
  });

  // skill
  it("matches skill by name case-insensitive", () => {
    expect(
      identityMatch("skill", { name: "TypeScript" }, { name: "typescript" })
    ).toBe(true);
  });

  // experience
  it("matches experience by company + role", () => {
    const a = { company: "Google", role: "Software Engineer" };
    const b = { company: "Google", role: "Software Engineer", startDate: "2020" };
    expect(identityMatch("experience", a, b)).toBe(true);
  });

  it("does NOT match experience with different roles at same company", () => {
    expect(
      identityMatch(
        "experience",
        { company: "Google", role: "Software Engineer" },
        { company: "Google", role: "Tech Lead" }
      )
    ).toBe(false);
  });

  // social
  it("matches social by platform", () => {
    expect(
      identityMatch(
        "social",
        { platform: "github", url: "https://github.com/user1" },
        { platform: "GitHub", url: "https://github.com/user2" }
      )
    ).toBe(true);
  });

  // music
  it("matches music by title + artist", () => {
    expect(
      identityMatch(
        "music",
        { title: "Bohemian Rhapsody", artist: "Queen" },
        { title: "Bohemian Rhapsody", artist: "Queen", url: "https://..." }
      )
    ).toBe(true);
  });

  it("does NOT match music with different artists", () => {
    expect(
      identityMatch(
        "music",
        { title: "Yesterday", artist: "The Beatles" },
        { title: "Yesterday", artist: "Leona Lewis" }
      )
    ).toBe(false);
  });

  // identity
  it("returns false for identity category (skip)", () => {
    expect(
      identityMatch("identity", { name: "Tommaso Rossi" }, { name: "Tommaso Rossi" })
    ).toBe(false);
  });

  // project
  it("matches project by name", () => {
    expect(
      identityMatch(
        "project",
        { name: "OpenSelf", url: "https://github.com/openself" },
        { name: "openself" }
      )
    ).toBe(true);
  });

  it("matches project by url when names differ", () => {
    expect(
      identityMatch(
        "project",
        { name: "My Project", url: "https://github.com/openself" },
        { name: "OpenSelf", url: "https://github.com/openself" }
      )
    ).toBe(true);
  });

  // language
  it("matches language by language field or name", () => {
    expect(
      identityMatch(
        "language",
        { language: "Spanish", proficiency: "fluent" },
        { name: "Spanish" }
      )
    ).toBe(true);
  });

  // activity
  it("matches activity by name", () => {
    expect(
      identityMatch(
        "activity",
        { name: "Running", type: "sport" },
        { name: "running", activityCount: 5 }
      )
    ).toBe(true);
  });

  // reading
  it("does NOT match reading with different author slugs", () => {
    expect(
      identityMatch(
        "reading",
        { title: "Clean Code", author: "Robert Martin" },
        { title: "Clean Code", author: "Robert C. Martin", rating: 5 }
      )
    ).toBe(false);
  });

  it("matches reading with identical author slug", () => {
    expect(
      identityMatch(
        "reading",
        { title: "Clean Code", author: "Robert Martin" },
        { title: "Clean Code", author: "Robert Martin" }
      )
    ).toBe(true);
  });

  // stat
  it("matches stat by label", () => {
    expect(
      identityMatch(
        "stat",
        { label: "Years Experience", value: "10+" },
        { label: "years experience", value: "12" }
      )
    ).toBe(true);
  });

  // contact
  it("matches contact by type + value", () => {
    expect(
      identityMatch(
        "contact",
        { type: "email", value: "me@example.com" },
        { type: "email", value: "me@example.com", label: "Work" }
      )
    ).toBe(true);
  });

  it("does NOT match contact with different values", () => {
    expect(
      identityMatch(
        "contact",
        { type: "email", value: "me@example.com" },
        { type: "email", value: "other@example.com" }
      )
    ).toBe(false);
  });

  // achievement
  it("matches achievement by title", () => {
    expect(
      identityMatch(
        "achievement",
        { title: "AWS Solutions Architect" },
        { title: "AWS Solutions Architect", issuer: "Amazon", date: "2023" }
      )
    ).toBe(true);
  });

  // unknown
  it("returns false for unknown categories", () => {
    expect(identityMatch("unknown_cat", { x: 1 }, { x: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tryAssignCluster
// ---------------------------------------------------------------------------

describe("tryAssignCluster", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("skips identity category", async () => {
    const { tryAssignCluster } = await import("@/lib/services/fact-cluster-service");

    const result = await tryAssignCluster({
      factId: "new-fact-id",
      factKey: "identity-alice",
      category: "identity",
      value: { name: "Alice" },
      source: "chat",
      ownerKey: "owner-1",
      sessionId: "session-1",
    });

    expect(result).toBeNull();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("returns null when no identity match found", async () => {
    const { tryAssignCluster } = await import("@/lib/services/fact-cluster-service");

    // Candidate with different skill name
    const selectChain = makeChain({ all: mockAll });
    mockAll.mockReturnValueOnce([
      {
        id: "existing-fact",
        category: "skill",
        key: "skill-python",
        value: JSON.stringify({ name: "Python" }),
        source: "chat",
        clusterId: null,
        archivedAt: null,
      },
    ]);
    mockDb.select.mockReturnValue(selectChain);

    const result = await tryAssignCluster({
      factId: "new-fact-id",
      factKey: "skill-typescript",
      category: "skill",
      value: { name: "TypeScript" },
      source: "chat",
      ownerKey: "owner-1",
      sessionId: "session-1",
    });

    expect(result).toBeNull();
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("assigns to existing cluster when identity matches", async () => {
    const { tryAssignCluster } = await import("@/lib/services/fact-cluster-service");

    const existingClusterId = "cluster-abc";
    const existingFact = {
      id: "existing-fact",
      category: "skill",
      key: "skill-typescript",
      value: JSON.stringify({ name: "TypeScript" }),
      source: "chat",
      clusterId: existingClusterId,
      archivedAt: null,
    };

    // First select: candidates query → all()
    const selectCandidates = makeChain({ all: mockAll });
    mockAll.mockReturnValueOnce([existingFact]);

    // update().set().where().run()
    const updateChain = makeChain({ run: mockRun });
    mockRun.mockReturnValue(undefined);

    // Second select inside updateCanonicalKey: re-read existing fact → get()
    const selectFreshFact = makeChain({ get: mockGet });
    mockGet.mockReturnValueOnce({ key: "skill-typescript" });

    // Third select inside updateCanonicalKey: get current canonical → get()
    const selectCanonical = makeChain({ get: mockGet });
    mockGet.mockReturnValueOnce({ canonicalKey: "skill-typescript" });

    // Fourth select: read back cluster canonical key → get()
    const selectCluster = makeChain({ get: mockGet });
    mockGet.mockReturnValueOnce({ canonicalKey: "skill-typescript" });

    mockDb.select
      .mockReturnValueOnce(selectCandidates)   // candidates query
      .mockReturnValueOnce(selectFreshFact)     // updateCanonicalKey → re-read existing fact
      .mockReturnValueOnce(selectCanonical)     // updateCanonicalKey → get cluster
      .mockReturnValueOnce(selectCluster);      // read back after update

    mockDb.update.mockReturnValue(updateChain);

    const result = await tryAssignCluster({
      factId: "new-fact-id",
      factKey: "skill-typescript",
      category: "skill",
      value: { name: "TypeScript" },
      source: "chat",
      ownerKey: "owner-1",
      sessionId: "session-1",
    });

    expect(result).not.toBeNull();
    expect(result!.isNew).toBe(false);
    expect(result!.clusterId).toBe(existingClusterId);
    expect(result!.matchedFactId).toBe("existing-fact");
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("creates new cluster when match found but no existing cluster", async () => {
    const { tryAssignCluster } = await import("@/lib/services/fact-cluster-service");

    const existingFact = {
      id: "existing-fact",
      category: "skill",
      key: "skill-typescript",
      value: JSON.stringify({ name: "TypeScript" }),
      source: "chat",
      clusterId: null,
      archivedAt: null,
    };

    // candidates query → all()
    const selectCandidates = makeChain({ all: mockAll });
    mockAll.mockReturnValueOnce([existingFact]);
    mockDb.select.mockReturnValue(selectCandidates);

    // insert().values().run()
    const insertChain = makeChain({ run: mockRun });
    mockDb.insert.mockReturnValue(insertChain);

    // update().set().where().run() — called twice (for both facts)
    const updateChain = makeChain({ run: mockRun });
    mockRun.mockReturnValue(undefined);
    mockDb.update.mockReturnValue(updateChain);

    const result = await tryAssignCluster({
      factId: "new-fact-id",
      factKey: "skill-typescript",
      category: "skill",
      value: { name: "TypeScript" },
      source: "chat",
      ownerKey: "owner-1",
      sessionId: "session-1",
    });

    expect(result).not.toBeNull();
    expect(result!.isNew).toBe(true);
    expect(typeof result!.clusterId).toBe("string");
    expect(result!.matchedFactId).toBe("existing-fact");
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });
});
