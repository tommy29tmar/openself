/**
 * Thin Spotify API client.
 * Wraps fetch with auth headers and 401 detection.
 * Throws TokenExpiredError on 401 so withTokenRefresh() can catch it.
 */

import { TokenExpiredError } from "../token-refresh";

// Legacy alias for test compat
export const SpotifyAuthError = TokenExpiredError;

const BASE_URL = "https://api.spotify.com/v1";

// ── Types ────────────────────────────────────────────────────────────

export type SpotifyProfile = {
  id: string;
  display_name: string | null;
  external_urls: { spotify: string };
};

export type SpotifyArtist = {
  id: string;
  name: string;
  genres: string[] | null;
  external_urls: { spotify: string };
};

export type SpotifyTrack = {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  external_urls: { spotify: string };
};

// ── Internal fetch wrapper ───────────────────────────────────────────

async function spotifyFetch(url: string, token: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new TokenExpiredError();
  if (!res.ok) throw new Error(`Spotify API ${res.status}: ${url}`);
  return res;
}

// ── Public API ───────────────────────────────────────────────────────

export async function fetchSpotifyProfile(
  token: string,
): Promise<SpotifyProfile> {
  const res = await spotifyFetch(`${BASE_URL}/me`, token);
  return res.json();
}

export async function fetchTopArtists(
  token: string,
  timeRange: string,
  limit = 10,
): Promise<SpotifyArtist[]> {
  const res = await spotifyFetch(
    `${BASE_URL}/me/top/artists?time_range=${timeRange}&limit=${limit}`,
    token,
  );
  const data = await res.json();
  return data.items ?? [];
}

export async function fetchTopTracks(
  token: string,
  timeRange: string,
  limit = 10,
): Promise<SpotifyTrack[]> {
  const res = await spotifyFetch(
    `${BASE_URL}/me/top/tracks?time_range=${timeRange}&limit=${limit}`,
    token,
  );
  const data = await res.json();
  return data.items ?? [];
}

export async function refreshSpotifyToken(
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.SPOTIFY_CLIENT_ID!,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET!,
    }),
  });

  if (res.status === 401) {
    throw new TokenExpiredError();
  }

  if (res.status === 400) {
    const text = await res.text();
    if (text.includes("invalid_grant")) {
      throw new TokenExpiredError();
    }
    throw new Error(`Spotify token refresh failed: ${res.status} — ${text}`);
  }

  if (!res.ok) {
    throw new Error(`Spotify token refresh failed: ${res.status}`);
  }

  return res.json();
}
