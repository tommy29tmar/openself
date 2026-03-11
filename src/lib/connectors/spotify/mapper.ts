/**
 * Spotify data → OpenSelf fact/event mappers.
 * Pure functions, no side effects.
 */

import type { EpisodicEventInput } from "../types";
import type { SpotifyProfile, SpotifyArtist, SpotifyTrack } from "./client";

export type FactInput = {
  category: string;
  key: string;
  value: Record<string, unknown>;
};

// ── Profile ──────────────────────────────────────────────────────────

export function mapSpotifyProfile(profile: SpotifyProfile): FactInput[] {
  return [
    {
      category: "social",
      key: "spotify-profile",
      value: {
        platform: "spotify",
        url: profile.external_urls.spotify,
        label: profile.display_name || profile.id,
      },
    },
  ];
}

// ── Top Artists ──────────────────────────────────────────────────────

export function mapSpotifyTopArtists(artists: SpotifyArtist[]): FactInput[] {
  return artists.map((a) => ({
    category: "interest",
    key: `sp-artist-${a.id}`,
    value: {
      name: a.name,
      genres: a.genres,
      url: a.external_urls.spotify,
    },
  }));
}

// ── Top Tracks ───────────────────────────────────────────────────────

export function mapSpotifyTopTracks(tracks: SpotifyTrack[]): FactInput[] {
  return tracks.map((t) => ({
    category: "interest",
    key: `sp-track-${t.id}`,
    value: {
      name: t.name,
      artists: t.artists.map((a) => a.name),
      url: t.external_urls.spotify,
    },
  }));
}

// ── Genre Aggregation ────────────────────────────────────────────────

export function mapSpotifyGenres(artists: SpotifyArtist[]): FactInput[] {
  const genreCounts = new Map<string, number>();
  for (const a of artists) {
    for (const g of a.genres) {
      genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
    }
  }

  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return topGenres.map(([genre]) => ({
    category: "interest",
    key: `sp-genre-${genre.replace(/\s+/g, "-").toLowerCase()}`,
    value: { name: genre, type: "music_genre" },
  }));
}

// ── Taste Shift Detection ────────────────────────────────────────────

/**
 * Compares current short-term top-5 artist IDs with previous snapshot.
 * If >= 3 out of 5 have changed, emits a taste-shift episodic event.
 * Returns null on first sync (previousTop5 is empty) or when shift < 3.
 */
export function detectTasteShift(
  currentTop5: string[],
  previousTop5: string[],
): EpisodicEventInput | null {
  if (previousTop5.length === 0) return null;

  const previousSet = new Set(previousTop5);
  const changed = currentTop5.filter((id) => !previousSet.has(id));

  if (changed.length < 3) return null;

  return {
    externalId: `taste-shift-${Date.now()}`,
    eventAtUnix: Math.floor(Date.now() / 1000),
    eventAtHuman: new Date().toISOString(),
    actionType: "music",
    narrativeSummary: `Musical taste shift detected: ${changed.length}/5 top artists changed`,
    entities: [],
  };
}
