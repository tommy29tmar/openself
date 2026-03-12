/**
 * Spotify sync orchestration.
 * Fetches profile + top artists + top tracks → maps to facts → batch writes.
 * Detects taste-shift events by comparing short-term top-5 artists with previous snapshot.
 * Archives stale sp-artist/sp-track/sp-genre facts after STALE_THRESHOLD consecutive absent syncs.
 */

import {
  getConnectorWithCredentials,
  updateConnectorStatus,
} from "../connector-service";
import { batchCreateFacts } from "../connector-fact-writer";
import { batchRecordEvents } from "../connector-event-writer";
import { withTokenRefresh, TokenExpiredError } from "../token-refresh";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getDraft } from "@/lib/services/page-service";
import {
  archiveFact,
  getActiveFactKeysByPrefix,
  findFactsByKeyPattern,
} from "@/lib/services/kb-service";
import {
  fetchSpotifyProfile,
  fetchTopArtists,
  fetchTopTracks,
  refreshSpotifyToken,
} from "./client";
import {
  mapSpotifyProfile,
  mapSpotifyTopArtists,
  mapSpotifyTopTracks,
  mapSpotifyGenres,
  detectTasteShift,
} from "./mapper";
import type { SyncResult, EpisodicEventInput } from "../types";
import { db } from "@/lib/db";
import { connectors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getFactLanguage } from "@/lib/services/preferences-service";

/** Number of consecutive syncs a Spotify fact must be absent before archival. */
export const STALE_THRESHOLD = 3;

type TasteShiftCursor = {
  top5ArtistIds: string[];
  staleSinceSync?: Record<string, number>;
};

/**
 * Track which Spotify fact keys have been absent from the current top list across syncs.
 * Keys are FULL fact keys (e.g., "sp-artist-abc123") to prevent namespace collisions.
 *
 * Returns an updated stale counter map. Keys that reappear are removed (counter reset).
 * Keys not in currentKeys have their counter incremented.
 */
export function computeStaleArchival(
  staleCounters: Record<string, number>,
  currentKeys: Set<string>,
  allTrackedKeys: string[],
): Record<string, number> {
  const updated: Record<string, number> = {};
  for (const key of allTrackedKeys) {
    if (currentKeys.has(key)) continue; // Reappeared — reset (omit from result)
    updated[key] = (staleCounters[key] ?? 0) + 1;
  }
  return updated;
}

export async function syncSpotify(
  connectorId: string,
  ownerKey: string,
): Promise<SyncResult> {
  const connector = getConnectorWithCredentials(connectorId);
  if (!connector?.decryptedCredentials) {
    return {
      factsCreated: 0,
      factsUpdated: 0,
      eventsCreated: 0,
      error: "No credentials",
    };
  }

  const scope = resolveOwnerScopeForWorker(ownerKey);
  const factLanguage = getFactLanguage(scope.knowledgePrimaryKey) ?? "en";
  const existingDraft = getDraft(scope.knowledgePrimaryKey);

  try {
    // All Spotify API calls are wrapped in withTokenRefresh for auto-retry on 401
    const profile = await withTokenRefresh(
      connectorId,
      refreshSpotifyToken,
      (token) => fetchSpotifyProfile(token),
    );

    const mediumArtists = await withTokenRefresh(
      connectorId,
      refreshSpotifyToken,
      (token) => fetchTopArtists(token, "medium_term", 10),
    );

    const mediumTracks = await withTokenRefresh(
      connectorId,
      refreshSpotifyToken,
      (token) => fetchTopTracks(token, "medium_term", 10),
    );

    // Short-term top 5 for taste-shift detection
    const shortTermArtists = await withTokenRefresh(
      connectorId,
      refreshSpotifyToken,
      (token) => fetchTopArtists(token, "short_term", 5),
    );

    // ── Map to facts ──────────────────────────────────────────────────
    const profileFacts = mapSpotifyProfile(profile);
    const artistFacts = mapSpotifyTopArtists(mediumArtists);
    const trackFacts = mapSpotifyTopTracks(mediumTracks);
    const genreFacts = mapSpotifyGenres(mediumArtists);
    const allFacts = [...profileFacts, ...artistFacts, ...trackFacts, ...genreFacts];

    // ── Parse previous cursor ──────────────────────────────────────────
    let previousTop5: string[] = [];
    let prevStaleCounters: Record<string, number> = {};
    if (connector.syncCursor) {
      try {
        const cursor = JSON.parse(connector.syncCursor) as TasteShiftCursor;
        previousTop5 = cursor.top5ArtistIds ?? [];
        prevStaleCounters = cursor.staleSinceSync ?? {};
      } catch {
        // Invalid cursor — treat as first sync
      }
    }

    // ── Stale fact archival (BEFORE batchCreateFacts) ───────────────────
    // Collect current fact keys from this sync's mapped facts (sp-artist-*, sp-track-*, sp-genre-*)
    const currentFactKeys = new Set(allFacts.map((f) => f.key));

    // Query all existing active sp-* fact keys in the DB
    const existingSpKeys = getActiveFactKeysByPrefix(scope.knowledgePrimaryKey, "sp-");

    // Compute updated stale counters
    const updatedStaleCounters = computeStaleArchival(
      prevStaleCounters,
      currentFactKeys,
      existingSpKeys,
    );

    // Archive facts that have been absent for >= STALE_THRESHOLD syncs
    const keysToArchive = Object.entries(updatedStaleCounters)
      .filter(([, count]) => count >= STALE_THRESHOLD)
      .map(([key]) => key);

    let factsArchived = 0;
    for (const key of keysToArchive) {
      // Exact key match — use the key as a literal LIKE pattern (no wildcards)
      const matches = findFactsByKeyPattern(scope.knowledgePrimaryKey, key);
      for (const match of matches) {
        if (match.key === key) {
          const archived = archiveFact(match.id);
          if (archived) factsArchived++;
        }
      }
      // Remove archived key from stale tracking
      delete updatedStaleCounters[key];
    }

    if (factsArchived > 0) {
      console.log(`[spotify-sync] archived ${factsArchived} stale facts`);
    }

    // ── Write current facts ─────────────────────────────────────────────
    const username = existingDraft?.username ?? profile.display_name ?? profile.id;
    const report = await batchCreateFacts(
      allFacts,
      scope,
      username,
      factLanguage,
    );

    // ── Taste-shift event detection ───────────────────────────────────
    const currentTop5Ids = shortTermArtists.map((a) => a.id);
    let eventsCreated = 0;

    // First sync (no previous cursor): store baseline, no event
    // Subsequent sync: detect taste shift
    if (previousTop5.length > 0) {
      const tasteShiftEvent = detectTasteShift(currentTop5Ids, previousTop5);
      if (tasteShiftEvent) {
        const events: EpisodicEventInput[] = [tasteShiftEvent];
        const eventReport = await batchRecordEvents(events, {
          ownerKey,
          connectorId,
          connectorType: "spotify",
          sessionId: scope.knowledgePrimaryKey,
        });
        eventsCreated = eventReport.eventsWritten;
      }
    }

    // ── Update lastSync + syncCursor ──────────────────────────────────
    const newCursor: TasteShiftCursor = {
      top5ArtistIds: currentTop5Ids,
      staleSinceSync: Object.keys(updatedStaleCounters).length > 0
        ? updatedStaleCounters
        : undefined,
    };

    db.update(connectors)
      .set({
        lastSync: new Date().toISOString(),
        syncCursor: JSON.stringify(newCursor),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(connectors.id, connectorId))
      .run();

    return {
      factsCreated: report.factsWritten,
      factsUpdated: 0,
      factsArchived,
      eventsCreated,
    };
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      updateConnectorStatus(
        connectorId,
        "error",
        "Token expired or revoked",
      );
      return {
        factsCreated: 0,
        factsUpdated: 0,
        eventsCreated: 0,
        error: "Token expired or revoked — reconnect required",
      };
    }
    throw error;
  }
}
