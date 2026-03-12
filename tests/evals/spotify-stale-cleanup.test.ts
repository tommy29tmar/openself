import { describe, it, expect, vi, afterAll } from "vitest";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

// ── Mock heavy dependencies so sync.ts can be imported ──────────────

vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorWithCredentials: vi.fn(),
  updateConnectorStatus: vi.fn(),
}));

vi.mock("@/lib/connectors/connector-fact-writer", () => ({
  batchCreateFacts: vi.fn().mockResolvedValue({
    factsWritten: 0,
    factsSkipped: 0,
    errors: [],
  }),
}));

vi.mock("@/lib/connectors/connector-event-writer", () => ({
  batchRecordEvents: vi.fn().mockResolvedValue({
    eventsWritten: 0,
    eventsSkipped: 0,
    errors: [],
  }),
}));

vi.mock("@/lib/connectors/token-refresh", () => ({
  TokenExpiredError: class extends Error {},
  withTokenRefresh: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: vi.fn(),
}));

vi.mock("@/lib/services/page-service", () => ({
  getDraft: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: vi.fn().mockReturnValue("en"),
}));

vi.mock("@/lib/connectors/spotify/client", () => ({
  fetchSpotifyProfile: vi.fn(),
  fetchTopArtists: vi.fn(),
  fetchTopTracks: vi.fn(),
  refreshSpotifyToken: vi.fn(),
}));

import {
  computeStaleArchival,
  STALE_THRESHOLD,
} from "@/lib/connectors/spotify/sync";
import { archiveFact } from "@/lib/services/kb-service";
import { createFact } from "@/lib/services/kb-service";

describe("Spotify stale facts cleanup", () => {
  const knowledgeKey = `test-spotify-stale-${randomUUID()}`;

  afterAll(() => {
    sqlite
      .prepare("DELETE FROM facts WHERE session_id = ?")
      .run(knowledgeKey);
    sqlite
      .prepare("DELETE FROM sessions WHERE id = ?")
      .run(knowledgeKey);
  });

  // ── Pure function tests ───────────────────────────────────────────

  it("should track stale counters by full fact key", () => {
    const currentKeys = new Set(["sp-artist-new1", "sp-track-new2"]);
    let cursor: Record<string, number> = {};

    // Sync 1: counter goes to 1
    cursor = computeStaleArchival(cursor, currentKeys, ["sp-artist-old123"]);
    expect(cursor["sp-artist-old123"]).toBe(1);

    // Sync 2: counter goes to 2
    cursor = computeStaleArchival(cursor, currentKeys, ["sp-artist-old123"]);
    expect(cursor["sp-artist-old123"]).toBe(2);

    // Sync 3: counter goes to 3
    cursor = computeStaleArchival(cursor, currentKeys, ["sp-artist-old123"]);
    expect(cursor["sp-artist-old123"]).toBe(3);
  });

  it("should reset counter when artist reappears", () => {
    let cursor: Record<string, number> = { "sp-artist-old123": 2 };
    const currentKeys = new Set(["sp-artist-old123", "sp-track-new1"]);

    cursor = computeStaleArchival(cursor, currentKeys, ["sp-artist-old123"]);
    expect(cursor["sp-artist-old123"]).toBeUndefined();
  });

  it("should not track keys that are in currentKeys", () => {
    const currentKeys = new Set(["sp-artist-a", "sp-track-b"]);
    const result = computeStaleArchival(
      {},
      currentKeys,
      ["sp-artist-a", "sp-track-b"],
    );
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("should use full key to avoid namespace collisions", () => {
    // "sp-artist-abc" and "sp-genre-abc" share "abc" suffix but are distinct keys
    const currentKeys = new Set(["sp-artist-abc"]);
    const result = computeStaleArchival(
      {},
      currentKeys,
      ["sp-artist-abc", "sp-genre-abc"],
    );
    expect(result["sp-artist-abc"]).toBeUndefined();
    expect(result["sp-genre-abc"]).toBe(1);
  });

  it("should export STALE_THRESHOLD as 3", () => {
    expect(STALE_THRESHOLD).toBe(3);
  });

  // ── DB integration tests ──────────────────────────────────────────

  it("should set archived_at in DB via archiveFact", () => {
    // Create session first to satisfy FK constraint
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO sessions (id, invite_code, created_at) VALUES (?, 'test', datetime('now'))`,
      )
      .run(knowledgeKey);

    const factId = randomUUID();
    sqlite
      .prepare(
        `INSERT INTO facts (id, session_id, profile_id, category, key, value, source, visibility, created_at, updated_at)
         VALUES (?, ?, ?, 'interest', 'sp-artist-staletest', '{"name":"Stale Artist"}', 'connector', 'proposed', datetime('now'), datetime('now'))`,
      )
      .run(factId, knowledgeKey, knowledgeKey);

    archiveFact(factId);

    const row = sqlite
      .prepare("SELECT archived_at FROM facts WHERE id = ?")
      .get(factId) as any;
    expect(row.archived_at).not.toBeNull();
  });

  it("should reactivate archived fact when it reappears via createFact", async () => {
    // Session already created by previous test (INSERT OR IGNORE)
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO sessions (id, invite_code, created_at) VALUES (?, 'test', datetime('now'))`,
      )
      .run(knowledgeKey);

    const factId = randomUUID();
    sqlite
      .prepare(
        `INSERT INTO facts (id, session_id, profile_id, category, key, value, source, visibility, archived_at, created_at, updated_at)
         VALUES (?, ?, ?, 'interest', 'sp-artist-reappear', '{"name":"Comeback Artist"}', 'connector', 'proposed', datetime('now'), datetime('now'), datetime('now'))`,
      )
      .run(factId, knowledgeKey, knowledgeKey);

    const before = sqlite
      .prepare("SELECT archived_at FROM facts WHERE id = ?")
      .get(factId) as any;
    expect(before.archived_at).not.toBeNull();

    await createFact(
      {
        category: "interest",
        key: "sp-artist-reappear",
        value: { name: "Comeback Artist" },
        source: "connector",
      },
      knowledgeKey,
      knowledgeKey,
    );

    const after = sqlite
      .prepare(
        "SELECT archived_at FROM facts WHERE key = 'sp-artist-reappear' AND session_id = ?",
      )
      .get(knowledgeKey) as any;
    expect(after.archived_at).toBeNull();
  });
});
