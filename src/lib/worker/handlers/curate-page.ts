import { getProjectedFacts } from "@/lib/services/fact-cluster-service";
import { getActiveSoul } from "@/lib/services/soul-service";
import { getFactDisplayOverrideService } from "@/lib/services/fact-display-override-service";
import { getActiveCopy } from "@/lib/services/section-copy-state-service";
import { createProposal } from "@/lib/services/proposal-service";
import { analyzeSectionForCuration } from "@/lib/services/page-curation-service";
import { SECTION_FACT_CATEGORIES, computeSectionFactsHash, computeHash } from "@/lib/services/personalization-hashing";
import { filterPublishableFacts, projectCanonicalConfig } from "@/lib/services/page-projection";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getPreferences } from "@/lib/services/preferences-service";
import { logEvent } from "@/lib/services/event-service";

export function hasRealChange(
  proposedFields: Record<string, unknown>,
  currentContent: Record<string, unknown>,
): boolean {
  return Object.entries(proposedFields).some(([key, val]) =>
    JSON.stringify(val) !== JSON.stringify(currentContent[key])
  );
}

export async function handlePageCuration(payload: Record<string, unknown>): Promise<void> {
  const { ownerKey } = payload as { ownerKey: string };
  const scope = resolveOwnerScopeForWorker(ownerKey);
  const allFacts = getProjectedFacts(scope.cognitiveOwnerKey, scope.knowledgeReadKeys);
  const publishable = filterPublishableFacts(allFacts);

  if (publishable.length === 0) return;

  const soul = getActiveSoul(scope.cognitiveOwnerKey);
  if (!soul?.compiled) return;

  const preferences = getPreferences(scope.knowledgePrimaryKey);
  const language = preferences.language ?? preferences.factLanguage ?? "en";

  const overrideService = getFactDisplayOverrideService();
  const existingOverrides = overrideService.getOverridesForOwner(scope.cognitiveOwnerKey, scope.knowledgeReadKeys);
  const agentCuratedFactIds = new Set(
    existingOverrides.filter((o) => o.source === "agent").map((o) => o.factId),
  );

  const page = projectCanonicalConfig(allFacts, "draft", language, undefined, scope.cognitiveOwnerKey, scope.knowledgeReadKeys);

  let totalProposals = 0;
  const MAX_PROPOSALS_PER_RUN = 10;

  for (const [sectionType, categories] of Object.entries(SECTION_FACT_CATEGORIES)) {
    if (totalProposals >= MAX_PROPOSALS_PER_RUN) break;

    const existingState = getActiveCopy(scope.cognitiveOwnerKey, sectionType, language);
    if (existingState?.source === "agent") continue;

    const sectionFacts = publishable.filter((f) => categories.includes(f.category));
    if (sectionFacts.length === 0) continue;

    const section = page.sections?.find((s) => s.type === sectionType);
    if (!section) continue;

    const suggestions = await analyzeSectionForCuration(
      {
        sectionType,
        currentContent: section.content as Record<string, unknown>,
        relevantFacts: sectionFacts,
        soulCompiled: soul.compiled,
        existingOverrides: existingOverrides.map((o) => ({ factId: o.factId, source: o.source })),
      },
      agentCuratedFactIds,
    );

    for (const suggestion of suggestions) {
      if (totalProposals >= MAX_PROPOSALS_PER_RUN) break;

      const factsHash = computeSectionFactsHash(publishable, sectionType);
      const soulHash = computeHash(soul.compiled);
      const baselineHash = computeHash(existingState?.personalizedContent ?? "");

      if (suggestion.type === "item" && suggestion.factId) {
        const fact = publishable.find((f) => f.id === suggestion.factId);
        if (!fact) continue;

        // fact.value is already parsed (Drizzle mode: "json")
        const factObj = fact.value as Record<string, unknown>;
        if (factObj && !hasRealChange(suggestion.fields, factObj)) continue;

        createProposal({
          ownerKey: scope.cognitiveOwnerKey,
          sectionType,
          language,
          currentContent: JSON.stringify(fact.value),
          proposedContent: JSON.stringify(suggestion.fields),
          issueType: "curation",
          reason: `[item:${suggestion.factId}] ${suggestion.reason}`,
          severity: "low",
          factsHash,
          soulHash,
          baselineStateHash: baselineHash,
        });
        totalProposals++;
      } else {
        const currentContentStr = JSON.stringify(section.content);
        let sectionObj: Record<string, unknown> | null = null;
        try { sectionObj = JSON.parse(currentContentStr); } catch {}
        if (sectionObj && !hasRealChange(suggestion.fields, sectionObj)) continue;

        createProposal({
          ownerKey: scope.cognitiveOwnerKey,
          sectionType,
          language,
          currentContent: currentContentStr,
          proposedContent: JSON.stringify(suggestion.fields),
          issueType: "curation",
          reason: suggestion.reason,
          severity: "low",
          factsHash,
          soulHash,
          baselineStateHash: baselineHash,
        });
        totalProposals++;
      }
    }
  }

  logEvent({
    eventType: "curate_page",
    actor: "worker",
    payload: { ownerKey: scope.cognitiveOwnerKey, proposalsCreated: totalProposals },
  });
}
