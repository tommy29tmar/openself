import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  fetchSpotifyProfile,
  fetchTopArtists,
  fetchTopTracks,
  refreshSpotifyToken,
  SpotifyAuthError,
} from "@/lib/connectors/spotify/client";
import { TokenExpiredError } from "@/lib/connectors/token-refresh";

describe("Spotify client", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── SpotifyAuthError alias ──────────────────────────────────────────

  it("SpotifyAuthError is an alias for TokenExpiredError", () => {
    expect(SpotifyAuthError).toBe(TokenExpiredError);
  });

  // ── fetchSpotifyProfile ─────────────────────────────────────────────

  it("fetches profile", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "user1",
        display_name: "Test User",
        external_urls: { spotify: "https://open.spotify.com/user/user1" },
      }),
    });
    const profile = await fetchSpotifyProfile("token1");
    expect(profile.id).toBe("user1");
    expect(profile.display_name).toBe("Test User");
  });

  it("throws TokenExpiredError on 401", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(fetchSpotifyProfile("bad-token")).rejects.toThrow(
      TokenExpiredError,
    );
  });

  it("throws on non-401 errors", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchSpotifyProfile("token1")).rejects.toThrow(
      "Spotify API 500",
    );
  });

  // ── fetchTopArtists ─────────────────────────────────────────────────

  it("fetches top artists", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: "a1",
            name: "Artist 1",
            genres: ["indie"],
            external_urls: { spotify: "https://open.spotify.com/artist/a1" },
          },
          {
            id: "a2",
            name: "Artist 2",
            genres: ["pop", "dance"],
            external_urls: { spotify: "https://open.spotify.com/artist/a2" },
          },
        ],
      }),
    });
    const artists = await fetchTopArtists("token1", "medium_term");
    expect(artists).toHaveLength(2);
    expect(artists[0].name).toBe("Artist 1");
    expect(artists[1].genres).toEqual(["pop", "dance"]);
  });

  it("returns empty array when items is missing", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const artists = await fetchTopArtists("token1", "short_term", 5);
    expect(artists).toEqual([]);
  });

  // ── fetchTopTracks ──────────────────────────────────────────────────

  it("fetches top tracks", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: "t1",
            name: "Track 1",
            artists: [{ id: "a1", name: "Artist 1" }],
            external_urls: { spotify: "https://open.spotify.com/track/t1" },
          },
        ],
      }),
    });
    const tracks = await fetchTopTracks("token1", "long_term", 5);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].name).toBe("Track 1");
    expect(tracks[0].artists[0].name).toBe("Artist 1");
  });

  // ── refreshSpotifyToken ─────────────────────────────────────────────

  it("refreshes token successfully", async () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "new-token",
        refresh_token: "new-refresh",
        expires_in: 3600,
      }),
    });

    const result = await refreshSpotifyToken("old-refresh");
    expect(result.access_token).toBe("new-token");
    expect(result.refresh_token).toBe("new-refresh");
    expect(result.expires_in).toBe(3600);

    // Verify the request was made correctly
    expect(mockFetch).toHaveBeenCalledWith(
      "https://accounts.spotify.com/api/token",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws TokenExpiredError on 401 during refresh", async () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";

    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(refreshSpotifyToken("bad-refresh")).rejects.toThrow(
      TokenExpiredError,
    );
  });

  it("throws TokenExpiredError on invalid_grant during refresh", async () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        '{"error":"invalid_grant","error_description":"Refresh token revoked"}',
    });
    await expect(refreshSpotifyToken("revoked-refresh")).rejects.toThrow(
      TokenExpiredError,
    );
  });
});
