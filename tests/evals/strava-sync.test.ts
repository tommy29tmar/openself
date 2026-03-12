import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all dependencies ────────────────────────────────────────────

vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorWithCredentials: vi.fn(),
  updateConnectorStatus: vi.fn(),
}));

vi.mock("@/lib/connectors/connector-fact-writer", () => ({
  batchCreateFacts: vi.fn().mockResolvedValue({ factsWritten: 3, factsSkipped: 0, errors: [] }),
}));

vi.mock("@/lib/connectors/connector-event-writer", () => ({
  batchRecordEvents: vi.fn().mockResolvedValue({ eventsWritten: 2, eventsSkipped: 0, errors: [] }),
}));

vi.mock("@/lib/connectors/token-refresh", async () => {
  const actual = await vi.importActual("@/lib/connectors/token-refresh") as Record<string, unknown>;
  return {
    ...actual,
    withTokenRefresh: vi.fn().mockImplementation(
      async (_id: string, _refresh: unknown, apiFn: (token: string) => Promise<unknown>) => apiFn("test-token"),
    ),
  };
});

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: vi.fn().mockReturnValue({
    cognitiveOwnerKey: "owner-1",
    knowledgeReadKeys: ["session-1"],
    knowledgePrimaryKey: "session-1",
    currentSessionId: "session-1",
  }),
}));

vi.mock("@/lib/services/page-service", () => ({
  getDraft: vi.fn().mockReturnValue({ username: "testuser" }),
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: vi.fn().mockReturnValue("en"),
}));

vi.mock("@/lib/connectors/strava/client", () => ({
  fetchStravaProfile: vi.fn().mockResolvedValue({
    id: 123,
    firstname: "Test",
    lastname: "User",
    city: "Rome",
    state: null,
    country: "Italy",
  }),
  fetchAllActivities: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "Morning Run",
      sport_type: "Run",
      distance: 10000,
      moving_time: 3600,
      elapsed_time: 3700,
      total_elevation_gain: 50,
      start_date: "2025-06-01T08:00:00Z",
      pr_count: 1,
      achievement_count: 2,
    },
  ]),
  fetchStravaStats: vi.fn().mockResolvedValue({
    all_run_totals: { count: 50, distance: 250000, moving_time: 90000 },
    all_ride_totals: { count: 0, distance: 0, moving_time: 0 },
    all_swim_totals: { count: 0, distance: 0, moving_time: 0 },
  }),
  refreshStravaToken: vi.fn(),
}));

// Mock DB operations
const mockDbRun = vi.fn().mockReturnValue({ changes: 1 });
const mockDbOnConflict = vi.fn().mockReturnValue({ run: mockDbRun });
const mockDbValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockDbOnConflict });
const mockDbInsert = vi.fn().mockReturnValue({ values: mockDbValues });
const mockDbSet = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ run: mockDbRun }) });
const mockDbUpdate = vi.fn().mockReturnValue({ set: mockDbSet });

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
  sqlite: {},
}));

vi.mock("@/lib/db/schema", () => ({
  connectors: {},
  connectorItems: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// ── Tests ────────────────────────────────────────────────────────────

import { syncStrava } from "@/lib/connectors/strava/sync";
import { getConnectorWithCredentials } from "@/lib/connectors/connector-service";
import { batchRecordEvents } from "@/lib/connectors/connector-event-writer";
import { batchCreateFacts } from "@/lib/connectors/connector-fact-writer";

const mockGetConnector = vi.mocked(getConnectorWithCredentials);
const mockBatchRecordEvents = vi.mocked(batchRecordEvents);
const mockBatchCreateFacts = vi.mocked(batchCreateFacts);

describe("syncStrava", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCreateFacts.mockResolvedValue({ factsWritten: 3, factsSkipped: 0, errors: [], createdFacts: [] });
    mockBatchRecordEvents.mockResolvedValue({ eventsWritten: 2, eventsSkipped: 0, errors: [] });
  });

  it("returns error when no credentials", async () => {
    mockGetConnector.mockReturnValue(null);
    const result = await syncStrava("conn-1", "owner-1");
    expect(result.error).toBe("No credentials");
    expect(result.factsCreated).toBe(0);
  });

  it("creates facts on first sync", async () => {
    mockGetConnector.mockReturnValue({
      id: "conn-1",
      connectorType: "strava",
      ownerKey: "owner-1",
      status: "connected",
      credentials: "encrypted",
      config: null,
      syncCursor: null,
      lastSync: null,
      lastError: null,
      enabled: true,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
      decryptedCredentials: {
        access_token: "token",
        refresh_token: "refresh",
      },
    });

    const result = await syncStrava("conn-1", "owner-1");
    expect(result.factsCreated).toBe(3);
    expect(result.error).toBeUndefined();
  });

  it("emits NO episodic events on first sync (baseline)", async () => {
    mockGetConnector.mockReturnValue({
      id: "conn-1",
      connectorType: "strava",
      ownerKey: "owner-1",
      status: "connected",
      credentials: "encrypted",
      config: null,
      syncCursor: null,
      lastSync: null, // first sync
      lastError: null,
      enabled: true,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
      decryptedCredentials: {
        access_token: "token",
        refresh_token: "refresh",
      },
    });

    const result = await syncStrava("conn-1", "owner-1");
    expect(result.eventsCreated).toBe(0);
    expect(mockBatchRecordEvents).not.toHaveBeenCalled();
  });

  it("emits episodic events on subsequent sync", async () => {
    mockGetConnector.mockReturnValue({
      id: "conn-1",
      connectorType: "strava",
      ownerKey: "owner-1",
      status: "connected",
      credentials: "encrypted",
      config: null,
      syncCursor: "1700000000",
      lastSync: "2025-01-01T00:00:00Z", // not first sync
      lastError: null,
      enabled: true,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
      decryptedCredentials: {
        access_token: "token",
        refresh_token: "refresh",
      },
    });

    const result = await syncStrava("conn-1", "owner-1");
    expect(result.eventsCreated).toBe(2);
    expect(mockBatchRecordEvents).toHaveBeenCalledTimes(1);
    // Verify event context
    expect(mockBatchRecordEvents).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        ownerKey: "owner-1",
        connectorId: "conn-1",
        connectorType: "strava",
      }),
    );
  });

  it("returns combined result counts", async () => {
    mockGetConnector.mockReturnValue({
      id: "conn-1",
      connectorType: "strava",
      ownerKey: "owner-1",
      status: "connected",
      credentials: "encrypted",
      config: null,
      syncCursor: "1700000000",
      lastSync: "2025-01-01T00:00:00Z",
      lastError: null,
      enabled: true,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
      decryptedCredentials: {
        access_token: "token",
        refresh_token: "refresh",
      },
    });

    const result = await syncStrava("conn-1", "owner-1");
    expect(result.factsCreated).toBe(3);
    expect(result.factsUpdated).toBe(0);
    expect(result.eventsCreated).toBe(2);
    expect(result.error).toBeUndefined();
  });
});
