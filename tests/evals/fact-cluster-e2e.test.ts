import { describe, it, expect } from "vitest";
import {
  identityMatch,
  projectClusteredFacts,
  slugifyForMatch,
  pickCanonicalKey,
  type ProjectedFact,
} from "@/lib/services/fact-cluster-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Minimal FactRow shape for testing
function makeFact(overrides: Record<string, unknown>) {
  return {
    id: overrides.id ?? "f-1",
    sessionId: overrides.sessionId ?? "sess-1",
    profileId: overrides.profileId ?? "owner-1",
    category: overrides.category ?? "skill",
    key: overrides.key ?? "skill-test",
    value: overrides.value ?? { name: "TypeScript" },
    source: overrides.source ?? "chat",
    confidence: overrides.confidence ?? 1.0,
    visibility: (overrides.visibility as string) ?? "public",
    sortOrder: (overrides.sortOrder as number) ?? 0,
    parentFactId: (overrides.parentFactId as string) ?? null,
    archivedAt: (overrides.archivedAt as string) ?? null,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00Z",
    clusterId: (overrides.clusterId as string) ?? null,
  } as any;
}

// ---------------------------------------------------------------------------
// Scenario 1: skill dedup across chat + connector
// ---------------------------------------------------------------------------

describe("fact clustering e2e scenario", () => {
  describe("Scenario 1: skill dedup across chat + connector", () => {
    const chatFact = makeFact({
      id: "chat-ts",
      key: "typescript",
      category: "skill",
      value: { name: "TypeScript", level: "advanced" },
      source: "chat",
      visibility: "public",
      clusterId: "cluster-1",
    });
    const connectorFact = makeFact({
      id: "li-typescript",
      key: "li-typescript",
      category: "skill",
      value: { name: "TypeScript" },
      source: "connector",
      visibility: "public",
      clusterId: "cluster-1",
    });
    const clusters = [{
      id: "cluster-1",
      ownerKey: "owner-1",
      category: "skill",
      canonicalKey: "typescript",
    }];

    it("identityMatch detects same skill", () => {
      expect(identityMatch("skill", chatFact.value, connectorFact.value)).toBe(true);
    });

    it("pickCanonicalKey prefers chat key over connector-prefixed key", () => {
      expect(pickCanonicalKey("connector", "li-typescript", chatFact as any)).toBe("typescript");
    });

    it("projection merges into single enriched fact", () => {
      const projected = projectClusteredFacts(
        [chatFact, connectorFact],
        clusters,
      );
      expect(projected).toHaveLength(1);
      expect(projected[0].key).toBe("typescript");  // canonical key
      expect(projected[0].sources).toContain("chat");
      expect(projected[0].sources).toContain("connector");
      expect(projected[0].clusterSize).toBe(2);
      expect(projected[0].memberIds).toEqual(expect.arrayContaining(["chat-ts", "li-typescript"]));
    });

    it("projection preserves chat-sourced level field (higher priority)", () => {
      const projected = projectClusteredFacts([chatFact, connectorFact], clusters);
      const val = projected[0].value as Record<string, unknown>;
      expect(val.name).toBe("TypeScript");
      expect(val.level).toBe("advanced");  // from chat, not connector
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: experience dedup (company + role)
  // ---------------------------------------------------------------------------

  describe("Scenario 2: experience dedup (company + role)", () => {
    const chatExp = makeFact({
      id: "chat-exp",
      key: "acme-developer",
      category: "experience",
      value: { company: "Acme Corp", role: "Developer", status: "current" },
      source: "chat",
      clusterId: "cluster-exp",
    });
    const linkedinExp = makeFact({
      id: "li-acme-dev",
      key: "li-acme-dev",
      category: "experience",
      value: { company: "ACME CORP", role: "developer", startDate: "2022-01" },
      source: "connector",
      clusterId: "cluster-exp",
    });

    it("identityMatch handles case-insensitive company + role", () => {
      expect(identityMatch("experience", chatExp.value, linkedinExp.value)).toBe(true);
    });

    it("projection merges fields from both sources", () => {
      const projected = projectClusteredFacts(
        [chatExp, linkedinExp],
        [{ id: "cluster-exp", ownerKey: "owner-1", category: "experience", canonicalKey: "acme-developer" }],
      );
      expect(projected).toHaveLength(1);
      const val = projected[0].value as Record<string, unknown>;
      // Chat has higher priority — its fields win
      expect(val.company).toBe("Acme Corp");
      expect(val.role).toBe("Developer");
      expect(val.status).toBe("current");
      // Connector fills in missing startDate
      expect(val.startDate).toBe("2022-01");
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: music dedup (Spotify connector)
  // ---------------------------------------------------------------------------

  describe("Scenario 3: music dedup (Spotify connector)", () => {
    const chatSong = makeFact({
      id: "chat-song",
      key: "bohemian-rhapsody",
      category: "music",
      value: { title: "Bohemian Rhapsody", artist: "Queen", note: "my favorite" },
      source: "chat",
      clusterId: "cluster-music",
    });
    const spotifySong = makeFact({
      id: "sp-bohemian-rhapsody",
      key: "sp-bohemian-rhapsody",
      category: "music",
      value: { title: "Bohemian Rhapsody", artist: "Queen", url: "https://open.spotify.com/track/xxx" },
      source: "connector",
      clusterId: "cluster-music",
    });

    it("identityMatch detects same song by title + artist", () => {
      expect(identityMatch("music", chatSong.value, spotifySong.value)).toBe(true);
    });

    it("projection merges note from chat + url from Spotify", () => {
      const projected = projectClusteredFacts(
        [chatSong, spotifySong],
        [{ id: "cluster-music", ownerKey: "owner-1", category: "music", canonicalKey: "bohemian-rhapsody" }],
      );
      expect(projected).toHaveLength(1);
      const val = projected[0].value as Record<string, unknown>;
      expect(val.title).toBe("Bohemian Rhapsody");
      expect(val.note).toBe("my favorite");  // from chat
      expect(val.url).toBe("https://open.spotify.com/track/xxx");  // from Spotify
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: identity facts are never clustered
  // ---------------------------------------------------------------------------

  describe("Scenario 4: identity facts are never clustered", () => {
    it("identityMatch returns false for identity category", () => {
      expect(identityMatch("identity", { name: "John" }, { name: "John" })).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: unclustered facts pass through unchanged
  // ---------------------------------------------------------------------------

  describe("Scenario 5: unclustered facts pass through unchanged", () => {
    it("unclustered fact has memberIds=[self] and clusterSize=1", () => {
      const fact = makeFact({ id: "solo-fact", clusterId: null });
      const projected = projectClusteredFacts([fact], []);
      expect(projected).toHaveLength(1);
      expect(projected[0].clusterSize).toBe(1);
      expect(projected[0].memberIds).toEqual(["solo-fact"]);
      expect(projected[0].clusterId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: visibility resolution
  // ---------------------------------------------------------------------------

  describe("Scenario 6: visibility resolution", () => {
    it("private wins over public in cluster", () => {
      const privateFact = makeFact({ id: "f1", clusterId: "c1", visibility: "private", source: "chat" });
      const publicFact = makeFact({ id: "f2", clusterId: "c1", visibility: "public", source: "connector" });
      const projected = projectClusteredFacts(
        [privateFact, publicFact],
        [{ id: "c1", ownerKey: "o1", category: "skill", canonicalKey: "k1" }],
      );
      expect(projected[0].visibility).toBe("private");
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 7: slug normalization edge cases
  // ---------------------------------------------------------------------------

  describe("Scenario 7: slug normalization edge cases", () => {
    it("handles accented characters", () => {
      expect(slugifyForMatch("Café")).toBe("cafe");
    });

    it("handles mixed case and special chars", () => {
      expect(slugifyForMatch("Machine Learning & AI")).toBe("machine-learning-ai");
    });

    it("collapses whitespace and hyphens", () => {
      expect(slugifyForMatch("  hello   --  world  ")).toBe("hello-world");
    });

    it("returns empty for null/undefined", () => {
      expect(slugifyForMatch(null)).toBe("");
      expect(slugifyForMatch(undefined)).toBe("");
    });
  });
});
