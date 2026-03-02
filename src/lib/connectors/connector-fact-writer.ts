import type { OwnerScope } from "@/lib/auth/session";
import type { ImportReport } from "./types";
import { createFact, getActiveFacts } from "@/lib/services/kb-service";
import { getDraft, upsertDraft, computeConfigHash } from "@/lib/services/page-service";
import { projectCanonicalConfig, type DraftMeta } from "@/lib/services/page-projection";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { PROFILE_ID_CANONICAL } from "@/lib/flags";

type FactInput = {
  category: string;
  key: string;
  value: Record<string, unknown>;
  source?: string;
  confidence?: number;
  parentFactId?: string;
};

/**
 * Batch-create facts with connector semantics:
 * - source: "connector", actor: "connector" on every fact
 * - Per-fact error isolation (skip + log, don't crash batch)
 * - Single recompose after all facts
 */
export async function batchCreateFacts(
  inputs: FactInput[],
  scope: OwnerScope,
  username: string,
  factLanguage: string,
): Promise<ImportReport> {
  const report: ImportReport = { factsWritten: 0, factsSkipped: 0, errors: [] };

  if (inputs.length === 0) return report;

  // Two IDs because facts and drafts use different keying:
  //   - getActiveFacts: PROFILE_ID_CANONICAL=true → queries by facts.profileId (= cognitiveOwnerKey)
  //   - getDraft/upsertDraft/getFactLanguage: always keyed by page.id / agentConfig.id = sessionId (= knowledgePrimaryKey)
  const factsReadId = PROFILE_ID_CANONICAL
    ? scope.cognitiveOwnerKey
    : scope.knowledgePrimaryKey;
  const draftSessionId = scope.knowledgePrimaryKey;

  // Write facts sequentially (SQLite write contention avoidance)
  for (const input of inputs) {
    try {
      await createFact(
        { ...input, source: "connector" },
        scope.knowledgePrimaryKey,
        scope.cognitiveOwnerKey,
        { actor: "connector" },
      );
      report.factsWritten++;
    } catch (error) {
      report.factsSkipped++;
      report.errors.push({
        key: input.key,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Single recompose after all facts (mirrors tools.ts recomposeAfterMutation)
  try {
    const readKeys = PROFILE_ID_CANONICAL ? undefined : scope.knowledgeReadKeys;
    const allFacts = getActiveFacts(factsReadId, readKeys);
    if (allFacts.length === 0) return report;

    const factLang = getFactLanguage(draftSessionId) ?? factLanguage;
    const currentDraft = getDraft(draftSessionId);

    const draftMeta: DraftMeta | undefined = currentDraft
      ? {
          theme: currentDraft.config.theme,
          style: currentDraft.config.style,
          layoutTemplate: currentDraft.config.layoutTemplate,
          sections: currentDraft.config.sections,
        }
      : undefined;

    const composed = projectCanonicalConfig(
      allFacts,
      currentDraft?.username ?? username,
      factLang,
      draftMeta,
    );

    // Idempotency: skip write if hash matches
    const composedHash = computeConfigHash(composed);
    if (composedHash === currentDraft?.configHash) return report;

    upsertDraft(
      currentDraft?.username ?? username,
      composed,
      draftSessionId,
      scope.cognitiveOwnerKey,
    );
  } catch (error) {
    console.warn("[connector-fact-writer] recompose failed:", error);
  }

  return report;
}
