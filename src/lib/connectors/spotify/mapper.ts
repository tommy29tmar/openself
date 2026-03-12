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
  return artists.map((a) => {
    const genres = a.genres ?? [];
    const value: Record<string, unknown> = {
      title: a.name,
      url: a.external_urls.spotify,
    };
    if (genres.length > 0) {
      value.note = genres.join(", ");
    }
    return {
      category: "music",
      key: `sp-artist-${a.id}`,
      value,
    };
  });
}

// ── Top Tracks ───────────────────────────────────────────────────────

export function mapSpotifyTopTracks(tracks: SpotifyTrack[]): FactInput[] {
  return tracks.map((t) => ({
    category: "music",
    key: `sp-track-${t.id}`,
    value: {
      title: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      url: t.external_urls.spotify,
    },
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
