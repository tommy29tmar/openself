/**
 * Strava sync orchestration.
 * Fetches profile + activities + stats → maps to facts + episodic events → batch writes.
 *
 * Key behaviors:
 * - Uses withTokenRefresh() for all API calls (Strava tokens expire every 6h)
 * - Incremental sync via syncCursor (unix timestamp of last activity)
 * - First-sync baseline: when syncCursor is null, fetch activities but emit NO episodic events
 * - Stores max activity start_date timestamp as new syncCursor
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
  fetchStravaProfile,
  fetchAllActivities,
  fetchStravaStats,
  refreshStravaToken,
} from "./client";
import {
  mapStravaProfile,
  mapStravaActivities,
  mapStravaStats,
  mapStravaActivityEvents,
} from "./mapper";
import type { SyncResult } from "../types";
import { db } from "@/lib/db";
import { connectors, connectorItems } from "@/lib/db/schema";
import { randomUUID } from "node:crypto";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { eq } from "drizzle-orm";

export async function syncStrava(
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

  const isFirstSync = !connector.lastSync;
  const syncCursor = connector.syncCursor
    ? parseInt(connector.syncCursor, 10)
    : undefined;

  try {
    // Fetch profile (with token refresh)
    const profile = await withTokenRefresh(
      connectorId,
      refreshStravaToken,
      (token) => fetchStravaProfile(token),
    );

    // Fetch activities (with token refresh, incremental via syncCursor)
    const activities = await withTokenRefresh(
      connectorId,
      refreshStravaToken,
      (token) => fetchAllActivities(token, syncCursor),
    );

    // Fetch stats (with token refresh)
    const stats = await withTokenRefresh(
      connectorId,
      refreshStravaToken,
      (token) => fetchStravaStats(token, profile.id),
    );

    // Map to facts
    const profileFacts = mapStravaProfile(profile);
    const activityFacts = mapStravaActivities(activities);
    const statsFacts = mapStravaStats(stats);
    const allFacts = [...profileFacts, ...activityFacts, ...statsFacts];

    const username =
      existingDraft?.username ??
      `${profile.firstname}-${profile.lastname}`.toLowerCase().replace(/\s+/g, "-");
    const report = await batchCreateFacts(
      allFacts,
      scope,
      username,
      factLanguage,
    );

    // ── Episodic events ──────────────────────────────────────────────
    let eventsCreated = 0;

    if (!isFirstSync && activities.length > 0) {
      // Only emit episodic events for subsequent syncs (not first-sync baseline)
      const activityEvents = mapStravaActivityEvents(activities);

      if (activityEvents.length > 0) {
        const eventReport = await batchRecordEvents(activityEvents, {
          ownerKey,
          connectorId,
          connectorType: "strava",
          sessionId: scope.knowledgePrimaryKey,
        });
        eventsCreated = eventReport.eventsWritten;
      }
    }

    // ── Provenance tracking via connector_items ──────────────────────
    for (const activity of activities) {
      db.insert(connectorItems)
        .values({
          id: randomUUID(),
          connectorId,
          externalId: `activity-${activity.id}`,
          externalHash: activity.start_date,
          factId: null,
        })
        .onConflictDoUpdate({
          target: [connectorItems.connectorId, connectorItems.externalId],
          set: {
            externalHash: activity.start_date,
            lastSeenAt: new Date().toISOString(),
          },
        })
        .run();
    }

    // ── Update lastSync + syncCursor ─────────────────────────────────
    const maxTimestamp = activities.length > 0
      ? Math.max(
          ...activities.map((a) =>
            Math.floor(new Date(a.start_date).getTime() / 1000),
          ),
        )
      : syncCursor;

    db.update(connectors)
      .set({
        lastSync: new Date().toISOString(),
        syncCursor: maxTimestamp != null ? String(maxTimestamp) : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(connectors.id, connectorId))
      .run();

    return { factsCreated: report.factsWritten, factsUpdated: 0, eventsCreated };
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
