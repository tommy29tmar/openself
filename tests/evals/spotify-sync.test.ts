import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all external dependencies ────────────────────────────────────

vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorWithCredentials: vi.fn(),
  updateConnectorStatus: vi.fn(),
}));

vi.mock("@/lib/connectors/connector-fact-writer", () => ({
  batchCreateFacts: vi.fn().mockResolvedValue({
    factsWritten: 5,
    factsSkipped: 0,
    errors: [],
  }),
}));

vi.mock("@/lib/connectors/connector-event-writer", () => ({
  batchRecordEvents: vi.fn().mockResolvedValue({
    eventsWritten: 1,
    eventsSkipped: 0,
    errors: [],
  }),
}));

vi.mock("@/lib/connectors/token-refresh", () => {
  class TokenExpiredError extends Error {
    constructor() {
      super("Token expired");
      this.name = "TokenExpiredError";
    }
  }
  return {
    TokenExpiredError,
    withTokenRefresh: vi.fn(
      async (
        _connectorId: string,
        _refreshFn: unknown,
        apiFn: (token: string) => Promise<unknown>,
      ) => apiFn("mock-token"),
    ),
  };
});

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: vi.fn().mockReturnValue({
    cognitiveOwnerKey: "owner1",
    knowledgeReadKeys: ["session1"],
    knowledgePrimaryKey: "session1",
    currentSessionId: "session1",
  }),
}));

vi.mock("@/lib/services/page-service", () => ({
  getDraft: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: vi.fn().mockReturnValue("en"),
}));

vi.mock("@/lib/connectors/spotify/client", () => ({
  fetchSpotifyProfile: vi.fn().mockResolvedValue({
    id: "user1",
    display_name: "Test User",
    external_urls: { spotify: "https://open.spotify.com/user/user1" },
  }),
  fetchTopArtists: vi.fn().mockResolvedValue([
    {
      id: "a1",
      name: "Artist 1",
      genres: ["indie"],
      external_urls: { spotify: "url" },
    },
    {
      id: "a2",
      name: "Artist 2",
      genres: ["pop"],
      external_urls: { spotify: "url" },
    },
  ]),
  fetchTopTracks: vi.fn().mockResolvedValue([
    {
      id: "t1",
      name: "Track 1",
      artists: [{ id: "a1", name: "Artist 1" }],
      external_urls: { spotify: "url" },
    },
  ]),
  refreshSpotifyToken: vi.fn(),
}));

const mockDbUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      run: vi.fn(),
    }),
  }),
});

vi.mock("@/lib/db", () => ({
  db: {
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  connectors: "connectors_table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  archiveFact: vi.fn().mockReturnValue(true),
  getActiveFactKeysByPrefix: vi.fn().mockReturnValue([]),
  findFactsByKeyPattern: vi.fn().mockReturnValue([]),
}));

import { syncSpotify } from "@/lib/connectors/spotify/sync";
import { getConnectorWithCredentials } from "@/lib/connectors/connector-service";
import { batchRecordEvents } from "@/lib/connectors/connector-event-writer";
import { fetchTopArtists } from "@/lib/connectors/spotify/client";

const mockGetConnector = getConnectorWithCredentials as ReturnType<typeof vi.fn>;
const mockBatchRecordEvents = batchRecordEvents as ReturnType<typeof vi.fn>;
const mockFetchTopArtists = fetchTopArtists as ReturnType<typeof vi.fn>;

describe("syncSpotify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when no credentials", async () => {
    mockGetConnector.mockReturnValue(null);
    const result = await syncSpotify("conn1", "owner1");
    expect(result.error).toBe("No credentials");
    expect(result.factsCreated).toBe(0);
  });

  it("first sync: stores baseline, no taste-shift event", async () => {
    mockGetConnector.mockReturnValue({
      id: "conn1",
      decryptedCredentials: { access_token: "token1", refresh_token: "refresh1" },
      syncCursor: null, // first sync
    });

    // Return 5 artists for short_term (second call to fetchTopArtists)
    mockFetchTopArtists
      .mockResolvedValueOnce([
        // medium_term call
        { id: "a1", name: "A1", genres: ["indie"], external_urls: { spotify: "u" } },
        { id: "a2", name: "A2", genres: ["pop"], external_urls: { spotify: "u" } },
      ])
      .mockResolvedValueOnce([
        // short_term call
        { id: "s1", name: "S1", genres: [], external_urls: { spotify: "u" } },
        { id: "s2", name: "S2", genres: [], external_urls: { spotify: "u" } },
        { id: "s3", name: "S3", genres: [], external_urls: { spotify: "u" } },
        { id: "s4", name: "S4", genres: [], external_urls: { spotify: "u" } },
        { id: "s5", name: "S5", genres: [], external_urls: { spotify: "u" } },
      ]);

    const result = await syncSpotify("conn1", "owner1");
    expect(result.factsCreated).toBe(5);
    expect(result.eventsCreated).toBe(0);

    // batchRecordEvents should NOT have been called (first sync)
    expect(mockBatchRecordEvents).not.toHaveBeenCalled();

    // syncCursor should be stored with the top5
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("subsequent sync: detects taste shift when >=3 changed", async () => {
    const previousCursor = JSON.stringify({
      top5ArtistIds: ["old1", "old2", "old3", "old4", "old5"],
    });

    mockGetConnector.mockReturnValue({
      id: "conn1",
      decryptedCredentials: { access_token: "token1", refresh_token: "refresh1" },
      syncCursor: previousCursor,
    });

    mockFetchTopArtists
      .mockResolvedValueOnce([
        // medium_term
        { id: "a1", name: "A1", genres: ["indie"], external_urls: { spotify: "u" } },
      ])
      .mockResolvedValueOnce([
        // short_term — 3 of 5 are new
        { id: "old1", name: "O1", genres: [], external_urls: { spotify: "u" } },
        { id: "old2", name: "O2", genres: [], external_urls: { spotify: "u" } },
        { id: "new1", name: "N1", genres: [], external_urls: { spotify: "u" } },
        { id: "new2", name: "N2", genres: [], external_urls: { spotify: "u" } },
        { id: "new3", name: "N3", genres: [], external_urls: { spotify: "u" } },
      ]);

    const result = await syncSpotify("conn1", "owner1");
    expect(result.eventsCreated).toBe(1);
    expect(mockBatchRecordEvents).toHaveBeenCalledTimes(1);

    const events = mockBatchRecordEvents.mock.calls[0][0];
    expect(events).toHaveLength(1);
    expect(events[0].actionType).toBe("music");
    expect(events[0].narrativeSummary).toContain("3/5 top artists changed");
  });

  it("subsequent sync: no event when fewer than 3 changed", async () => {
    const previousCursor = JSON.stringify({
      top5ArtistIds: ["a1", "a2", "a3", "a4", "a5"],
    });

    mockGetConnector.mockReturnValue({
      id: "conn1",
      decryptedCredentials: { access_token: "token1", refresh_token: "refresh1" },
      syncCursor: previousCursor,
    });

    mockFetchTopArtists
      .mockResolvedValueOnce([
        // medium_term
        { id: "a1", name: "A1", genres: ["indie"], external_urls: { spotify: "u" } },
      ])
      .mockResolvedValueOnce([
        // short_term — only 1 new
        { id: "a1", name: "A1", genres: [], external_urls: { spotify: "u" } },
        { id: "a2", name: "A2", genres: [], external_urls: { spotify: "u" } },
        { id: "a3", name: "A3", genres: [], external_urls: { spotify: "u" } },
        { id: "a4", name: "A4", genres: [], external_urls: { spotify: "u" } },
        { id: "new1", name: "N1", genres: [], external_urls: { spotify: "u" } },
      ]);

    const result = await syncSpotify("conn1", "owner1");
    expect(result.eventsCreated).toBe(0);
    expect(mockBatchRecordEvents).not.toHaveBeenCalled();
  });
});
