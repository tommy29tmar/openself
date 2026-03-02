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
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getDraft } from "@/lib/services/page-service";
import {
  fetchProfile,
  fetchRepos,
  fetchRepoLanguages,
  GitHubAuthError,
} from "./client";
import { mapProfile, mapRepos } from "./mapper";
import type { SyncResult } from "../types";
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
    return { factsCreated: 0, factsUpdated: 0, error: "No credentials" };
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

    // Update lastSync + syncCursor after successful sync
    const latestPushedAt = repos
      .filter((r) => !r.fork)
      .map((r) => r.pushed_at)
      .sort()
      .pop();

    db.update(connectors)
      .set({
        lastSync: new Date().toISOString(),
        syncCursor: latestPushedAt ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(connectors.id, connectorId))
      .run();

    return { factsCreated: report.factsWritten, factsUpdated: 0 };
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      updateConnectorStatus(connectorId, "error", "Token expired or revoked");
      return {
        factsCreated: 0,
        factsUpdated: 0,
        error: "Token expired or revoked — reconnect required",
      };
    }
    throw error;
  }
}
