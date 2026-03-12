/**
 * Shared draft recompose helper for connector operations.
 * Used by batchCreateFacts (after adding facts) and disconnect route (after purging facts).
 */

import type { OwnerScope } from "@/lib/auth/session";
import { getActiveFacts } from "@/lib/services/kb-service";
import { getDraft, upsertDraft, computeConfigHash } from "@/lib/services/page-service";
import { projectCanonicalConfig, type DraftMeta } from "@/lib/services/page-projection";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { PROFILE_ID_CANONICAL } from "@/lib/flags";

/**
 * Recompose the draft page from current facts.
 * Idempotent: skips upsert if config hash matches.
 *
 * @returns true if draft was updated, false if skipped (no change or no facts)
 */
export function recomposeDraft(
  scope: OwnerScope,
  fallbackUsername: string,
  fallbackLanguage = "en",
): boolean {
  const factsReadId = PROFILE_ID_CANONICAL
    ? scope.cognitiveOwnerKey
    : scope.knowledgePrimaryKey;
  const draftSessionId = scope.knowledgePrimaryKey;
  const readKeys = PROFILE_ID_CANONICAL ? undefined : scope.knowledgeReadKeys;

  const allFacts = getActiveFacts(factsReadId, readKeys);
  if (allFacts.length === 0) return false;

  const factLang = getFactLanguage(draftSessionId) ?? fallbackLanguage;
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
    currentDraft?.username ?? fallbackUsername,
    factLang,
    draftMeta,
    scope.cognitiveOwnerKey,
  );

  const composedHash = computeConfigHash(composed);
  if (composedHash === currentDraft?.configHash) return false;

  upsertDraft(
    currentDraft?.username ?? fallbackUsername,
    composed,
    draftSessionId,
    scope.cognitiveOwnerKey,
  );

  return true;
}
