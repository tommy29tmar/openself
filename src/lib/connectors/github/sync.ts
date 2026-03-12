/**
 * GitHub initial sync orchestration.
 * Fetches profile + repos + languages → maps to facts → batch writes.
 * Updates connector_items for provenance tracking.
 */

import {
  getConnectorWithCredentials,
  updateConnectorStatus,
} from "../connector-service";
import { batchCreateFacts } from "../connector-fact-writer";
import { batchRecordEvents } from "../connector-event-writer";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getDraft } from "@/lib/services/page-service";
import {
  fetchProfile,
  fetchRepos,
  fetchRepoLanguages,
  fetchUserEvents,
  GitHubAuthError,
} from "./client";
import { filterSignificantEvents, mapToEpisodicEvents } from "./activity";
import { insertEvent } from "@/lib/services/episodic-service";
import { mapProfile, mapRepos } from "./mapper";
import type { SyncResult, EpisodicEventInput } from "../types";
import { db } from "@/lib/db";
import { connectors, connectorItems } from "@/lib/db/schema";
import { randomUUID } from "node:crypto";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { eq } from "drizzle-orm";

export async function syncGitHub(
  connectorId: string,
  ownerKey: string,
): Promise<SyncResult> {
  const connector = getConnectorWithCredentials(connectorId);
  if (!connector?.decryptedCredentials) {
    return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: "No credentials" };
  }

  // decryptCredentials() returns Record<string, unknown> but handle string for robustness
  const creds =
    typeof connector.decryptedCredentials === "string"
      ? JSON.parse(connector.decryptedCredentials)
      : connector.decryptedCredentials;
  const token = creds.access_token as string;

  const scope = resolveOwnerScopeForWorker(ownerKey);
  const factLanguage = getFactLanguage(scope.knowledgePrimaryKey) ?? "en";

  // Use existing draft username if available, fall back to GitHub login
  const existingDraft = getDraft(scope.knowledgePrimaryKey);

  try {
    const profile = await fetchProfile(token);
    const repos = await fetchRepos(token);

    // Fetch languages for top non-fork repos (limit to 30 to stay within rate limits)
    const topRepos = repos.filter((r) => !r.fork).slice(0, 30);
    const languagesByRepo = new Map<string, Record<string, number>>();
    for (const repo of topRepos) {
      const langs = await fetchRepoLanguages(
        token,
        repo.full_name.split("/")[0],
        repo.name,
      );
      if (langs) languagesByRepo.set(repo.full_name, langs);
    }

    const profileFacts = mapProfile(profile);
    const repoFacts = mapRepos(repos, languagesByRepo);
    const allFacts = [...profileFacts, ...repoFacts];

    const username = existingDraft?.username ?? profile.login;
    const report = await batchCreateFacts(
      allFacts,
      scope,
      username,
      factLanguage,
    );

    // ── Episodic events for truly new repos ──────────────────────────
    const isFirstSync = !connector.lastSync;
    let eventsCreated = 0;

    if (!isFirstSync) {
      // Query existing external IDs to detect truly new repos
      const existingItems = db
        .select()
        .from(connectorItems)
        .where(eq(connectorItems.connectorId, connectorId))
        .all();
      const existingExternalIds = new Set(existingItems.map((item) => item.externalId));

      const nonForkRepos = repos.filter((r) => !r.fork);
      const newRepos = nonForkRepos.filter(
        (r) => !existingExternalIds.has(r.node_id),
      );

      if (newRepos.length > 0) {
        const now = Math.floor(Date.now() / 1000);
        const nowHuman = new Date().toISOString();

        const events: EpisodicEventInput[] = newRepos.map((repo) => {
          const repoLangs = languagesByRepo.get(repo.full_name);
          const entities = repoLangs ? Object.keys(repoLangs) : [];
          const desc = repo.description
            ? `Created new repository: ${repo.name} — ${repo.description}`
            : `Created new repository: ${repo.name}`;
          return {
            externalId: `repo-${repo.node_id}`,
            eventAtUnix: now,
            eventAtHuman: nowHuman,
            actionType: "work",
            narrativeSummary: desc,
            entities,
          };
        });

        const eventReport = await batchRecordEvents(events, {
          ownerKey,
          connectorId,
          connectorType: "github",
          sessionId: scope.knowledgePrimaryKey,
        });
        eventsCreated = eventReport.eventsWritten;
      }
    }

    // Record provenance for each non-fork repo in connector_items
    for (const repo of repos.filter((r) => !r.fork)) {
      db.insert(connectorItems)
        .values({
          id: randomUUID(),
          connectorId,
          externalId: repo.node_id,
          externalHash: repo.pushed_at,
          factId: null,
        })
        .onConflictDoUpdate({
          target: [connectorItems.connectorId, connectorItems.externalId],
          set: {
            externalHash: repo.pushed_at,
            lastSeenAt: new Date().toISOString(),
          },
        })
        .run();
    }

    // --- Activity Stream: notable events → Episodic (T4) ---
    const activityCursorData: Record<string, string | null> = {};
    try {
      const rawCursor = connector.syncCursor ?? null;

      if (rawCursor) {
        try {
          Object.assign(activityCursorData, JSON.parse(rawCursor));
        } catch {
          // Legacy plain-timestamp cursor → migrate into repoCursor
          activityCursorData.repoCursor = rawCursor;
        }
      }
      const lastSeenEventId = activityCursorData.lastEventId ?? null;

      const rawEvents = await fetchUserEvents(
        token,
        profile.login,
        lastSeenEventId,
      );
      const significant = filterSignificantEvents(rawEvents);
      const episodicInputs = mapToEpisodicEvents(significant);

      let eventsWritten = 0;
      for (const input of episodicInputs) {
        try {
          insertEvent({
            ownerKey,
            sessionId: `connector:github:${connectorId}`,
            eventAtUnix: input.eventAtUnix,
            eventAtHuman: input.eventAtHuman,
            actionType: input.actionType,
            narrativeSummary: input.narrativeSummary,
            entities: input.entities,
            source: input.source,
            externalId: input.externalId,
          });
          eventsWritten++;
        } catch (err) {
          if (
            !(err instanceof Error && err.message.includes("UNIQUE"))
          ) {
            console.warn("[github] event write failed:", err);
          }
        }
      }
      console.info(
        `[github] activity: ${significant.length} significant, ${eventsWritten} written`,
      );

      if (rawEvents.length > 0) {
        activityCursorData.lastEventId = rawEvents[0].id;
      }
    } catch (err) {
      console.warn("[github] activity stream failed (non-fatal):", err);
    }

    // Update lastSync + syncCursor after successful sync
    const latestPushedAt = repos
      .filter((r) => !r.fork)
      .map((r) => r.pushed_at)
      .sort()
      .pop();

    db.update(connectors)
      .set({
        lastSync: new Date().toISOString(),
        syncCursor: JSON.stringify({
          ...activityCursorData,
          repoCursor: latestPushedAt ?? null,
        }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(connectors.id, connectorId))
      .run();

    return { factsCreated: report.factsWritten, factsUpdated: 0, eventsCreated };
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      updateConnectorStatus(connectorId, "error", "Token expired or revoked");
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
