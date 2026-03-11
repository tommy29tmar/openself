/**
 * Spotify sync orchestration.
 * Fetches profile + top artists + top tracks → maps to facts → batch writes.
 * Detects taste-shift events by comparing short-term top-5 artists with previous snapshot.
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

type TasteShiftCursor = {
  top5ArtistIds: string[];
};

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

    const username = existingDraft?.username ?? profile.display_name ?? profile.id;
    const report = await batchCreateFacts(
      allFacts,
      scope,
      username,
      factLanguage,
    );

    // ── Taste-shift event detection ───────────────────────────────────
    const currentTop5Ids = shortTermArtists.map((a) => a.id);

    // Parse previous cursor
    let previousTop5: string[] = [];
    if (connector.syncCursor) {
      try {
        const cursor = JSON.parse(connector.syncCursor) as TasteShiftCursor;
        previousTop5 = cursor.top5ArtistIds ?? [];
      } catch {
        // Invalid cursor — treat as first sync
      }
    }

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
    const newCursor: TasteShiftCursor = { top5ArtistIds: currentTop5Ids };

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
