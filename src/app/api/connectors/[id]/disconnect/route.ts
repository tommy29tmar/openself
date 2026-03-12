import { NextResponse } from "next/server";
import {
  disconnectConnectorWithPurge,
  getConnectorById,
} from "@/lib/connectors/connector-service";
import { connectorError } from "@/lib/connectors/api-errors";
import { resolveAuthenticatedConnectorScope } from "@/lib/connectors/route-auth";
import { getActiveFacts } from "@/lib/services/kb-service";
import { getDraft, upsertDraft, computeConfigHash } from "@/lib/services/page-service";
import { projectCanonicalConfig, type DraftMeta } from "@/lib/services/page-projection";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { PROFILE_ID_CANONICAL } from "@/lib/flags";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = resolveAuthenticatedConnectorScope(req);
  if (!scope) {
    return connectorError("AUTH_REQUIRED", "Authentication required.", 403, false);
  }

  const { id } = await params;
  const ownerKey = scope.cognitiveOwnerKey;

  // Parse body for purge flag
  let purge = false;
  try {
    const body = await req.json();
    purge = body.purge === true;
  } catch {
    // No body or invalid JSON → default purge=false
  }

  try {
    const connector = getConnectorById(id);
    if (!connector) {
      return connectorError("NOT_FOUND", "Connector not found.", 404, false);
    }
    if (connector.ownerKey !== ownerKey) {
      return connectorError("FORBIDDEN", "Connector does not belong to this user.", 403, false);
    }

    const { purgeResult } = disconnectConnectorWithPurge(id, ownerKey, purge);

    // Recompose draft if purge removed facts
    if (purgeResult && purgeResult.factsDeleted > 0) {
      try {
        const factsReadId = PROFILE_ID_CANONICAL
          ? scope.cognitiveOwnerKey
          : scope.knowledgePrimaryKey;
        const draftSessionId = scope.knowledgePrimaryKey;
        const readKeys = PROFILE_ID_CANONICAL ? undefined : scope.knowledgeReadKeys;
        const allFacts = getActiveFacts(factsReadId, readKeys);
        const factLang = getFactLanguage(draftSessionId) ?? "en";
        const currentDraft = getDraft(draftSessionId);

        const draftMeta: DraftMeta | undefined = currentDraft
          ? {
              surface: currentDraft.config.surface,
              voice: currentDraft.config.voice,
              light: currentDraft.config.light,
              style: currentDraft.config.style,
              layoutTemplate: currentDraft.config.layoutTemplate,
              sections: currentDraft.config.sections,
            }
          : undefined;

        const composed = projectCanonicalConfig(
          allFacts,
          currentDraft?.username ?? "draft",
          factLang,
          draftMeta,
          scope.cognitiveOwnerKey,
        );

        const composedHash = computeConfigHash(composed);
        if (composedHash !== currentDraft?.configHash) {
          upsertDraft(
            currentDraft?.username ?? "draft",
            composed,
            draftSessionId,
            scope.cognitiveOwnerKey,
          );
        }
      } catch (err) {
        console.warn("[disconnect] recompose after purge failed:", err);
      }
    }

    return NextResponse.json({
      success: true,
      purged: purge,
      ...(purgeResult
        ? {
            factsRemoved: purgeResult.factsDeleted,
            eventsRemoved: purgeResult.eventsDeleted,
          }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Return 409 for sync-in-progress guard
    if (message.includes("sync") && message.includes("in progress")) {
      return connectorError("SYNC_IN_PROGRESS", message, 409, false);
    }
    return connectorError("INTERNAL", message, 500, true);
  }
}
