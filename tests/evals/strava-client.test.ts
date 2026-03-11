import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  fetchStravaProfile,
  fetchAllActivities,
  fetchStravaStats,
  refreshStravaToken,
} from "@/lib/connectors/strava/client";
import { TokenExpiredError } from "@/lib/connectors/token-refresh";

describe("Strava client", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── fetchStravaProfile ─────────────────────────────────────────────

  it("fetches athlete profile", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 123,
        firstname: "Test",
        lastname: "User",
        city: "Rome",
        state: null,
        country: "Italy",
      }),
    });
    const profile = await fetchStravaProfile("token1");
    expect(profile.id).toBe(123);
    expect(profile.firstname).toBe("Test");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://www.strava.com/api/v3/athlete",
      expect.objectContaining({
        headers: { Authorization: "Bearer token1" },
      }),
    );
  });

  it("throws TokenExpiredError on 401", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(fetchStravaProfile("bad")).rejects.toThrow(TokenExpiredError);
  });

  it("throws on non-401 error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchStravaProfile("token")).rejects.toThrow("Strava API 500");
  });

  // ── fetchAllActivities ─────────────────────────────────────────────

  it("paginates activities until batch < perPage", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => Array(50).fill({ id: 1, name: "Run", sport_type: "Run" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 51, name: "Ride", sport_type: "Ride" }],
      });

    const activities = await fetchAllActivities("token1");
    expect(activities).toHaveLength(51);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns empty array when no activities", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    const activities = await fetchAllActivities("token1");
    expect(activities).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("passes after parameter for incremental sync", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    await fetchAllActivities("token1", 1700000000);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("after=1700000000");
  });

  // ── fetchStravaStats ───────────────────────────────────────────────

  it("fetches athlete stats", async () => {
    const mockStats = {
      all_run_totals: { count: 100, distance: 500000, moving_time: 180000 },
      all_ride_totals: { count: 50, distance: 300000, moving_time: 120000 },
      all_swim_totals: { count: 10, distance: 20000, moving_time: 36000 },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockStats,
    });
    const stats = await fetchStravaStats("token1", 123);
    expect(stats.all_run_totals.count).toBe(100);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://www.strava.com/api/v3/athletes/123/stats",
      expect.any(Object),
    );
  });

  // ── refreshStravaToken ─────────────────────────────────────────────

  it("refreshes token successfully", async () => {
    vi.stubEnv("STRAVA_CLIENT_ID", "test-id");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "test-secret");

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "new-token",
        refresh_token: "new-refresh",
        expires_in: 21600,
      }),
    });
    const result = await refreshStravaToken("old-refresh");
    expect(result.access_token).toBe("new-token");
    expect(result.refresh_token).toBe("new-refresh");

    vi.unstubAllEnvs();
  });

  it("throws TokenExpiredError on 401 during refresh", async () => {
    vi.stubEnv("STRAVA_CLIENT_ID", "test-id");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "test-secret");

    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(refreshStravaToken("bad-refresh")).rejects.toThrow(
      TokenExpiredError,
    );

    vi.unstubAllEnvs();
  });

  it("throws TokenExpiredError on invalid_grant", async () => {
    vi.stubEnv("STRAVA_CLIENT_ID", "test-id");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "test-secret");

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}',
    });
    await expect(refreshStravaToken("bad-refresh")).rejects.toThrow(
      TokenExpiredError,
    );

    vi.unstubAllEnvs();
  });
});
