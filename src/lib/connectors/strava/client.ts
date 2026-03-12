/**
 * Thin Strava API client.
 * Wraps fetch with auth headers, pagination, and 401 detection.
 * Throws TokenExpiredError on 401 so withTokenRefresh() can retry.
 */

import { TokenExpiredError } from "../token-refresh";

const BASE_URL = "https://www.strava.com/api/v3";

// ── Types ────────────────────────────────────────────────────────────

export type StravaProfile = {
  id: number;
  firstname: string;
  lastname: string;
  city: string | null;
  state: string | null;
  country: string | null;
};

export type StravaActivity = {
  id: number;
  name: string;
  sport_type: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number;
  start_date: string; // ISO
  pr_count: number;
  achievement_count: number;
};

export type StravaStats = {
  all_run_totals: { count: number; distance: number; moving_time: number };
  all_ride_totals: { count: number; distance: number; moving_time: number };
  all_swim_totals: { count: number; distance: number; moving_time: number };
};

// ── Internal fetch wrapper ───────────────────────────────────────────

async function stravaFetch(url: string, token: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new TokenExpiredError();
  if (!res.ok) throw new Error(`Strava API ${res.status}: ${url}`);
  return res;
}

// ── Public API ───────────────────────────────────────────────────────

export async function fetchStravaProfile(
  token: string,
): Promise<StravaProfile> {
  const res = await stravaFetch(`${BASE_URL}/athlete`, token);
  return res.json();
}

/**
 * Fetch all activities with pagination.
 * Fetches pages until batch.length < perPage.
 * @param after - Unix timestamp; only activities after this date are returned.
 */
export async function fetchAllActivities(
  token: string,
  after?: number,
  perPage = 50,
): Promise<StravaActivity[]> {
  const all: StravaActivity[] = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
    });
    if (after) params.set("after", String(after));
    const res = await stravaFetch(
      `${BASE_URL}/athlete/activities?${params}`,
      token,
    );
    const batch: StravaActivity[] = await res.json();
    all.push(...batch);
    if (batch.length < perPage || page >= 20) break;
    page++;
  }
  return all;
}

export async function fetchStravaStats(
  token: string,
  athleteId: number,
): Promise<StravaStats> {
  const res = await stravaFetch(
    `${BASE_URL}/athletes/${athleteId}/stats`,
    token,
  );
  return res.json();
}

/**
 * Refresh a Strava access token using the refresh token.
 * Strava tokens expire every 6 hours.
 */
export async function refreshStravaToken(
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
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
    throw new Error(`Strava token refresh failed: ${res.status} — ${text}`);
  }
  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status}`);
  }

  return res.json();
}
