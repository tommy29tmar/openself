import { getActiveFacts } from "@/lib/services/kb-service";
import { getActiveSoul } from "@/lib/services/soul-service";
import { getFactDisplayOverrideService } from "@/lib/services/fact-display-override-service";
import { getActiveCopy } from "@/lib/services/section-copy-state-service";
import { createProposal } from "@/lib/services/proposal-service";
import { analyzeSectionForCuration } from "@/lib/services/page-curation-service";
import { SECTION_FACT_CATEGORIES, computeSectionFactsHash, computeHash } from "@/lib/services/personalization-hashing";
import { filterPublishableFacts, projectCanonicalConfig } from "@/lib/services/page-projection";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { logEvent } from "@/lib/services/event-service";

export async function handlePageCuration(payload: Record<string, unknown>): Promise<void> {
  const { ownerKey } = payload as { ownerKey: string };
  const scope = resolveOwnerScopeForWorker(ownerKey);
  const allFacts = getActiveFacts(scope.cognitiveOwnerKey, scope.knowledgeReadKeys);
  const publishable = filterPublishableFacts(allFacts);

  if (publishable.length === 0) return;

  const soul = getActiveSoul(scope.cognitiveOwnerKey);
  if (!soul?.compiled) return;

  const overrideService = getFactDisplayOverrideService();
  const existingOverrides = overrideService.getOverridesForOwner(scope.cognitiveOwnerKey);
  const agentCuratedFactIds = new Set(
    existingOverrides.filter((o) => o.source === "agent").map((o) => o.factId),
  );

  const page = projectCanonicalConfig(allFacts, "draft", "en", undefined, scope.cognitiveOwnerKey);

  let totalProposals = 0;
  const MAX_PROPOSALS_PER_RUN = 10;

  for (const [sectionType, categories] of Object.entries(SECTION_FACT_CATEGORIES)) {
    if (totalProposals >= MAX_PROPOSALS_PER_RUN) break;

    const existingState = getActiveCopy(scope.cognitiveOwnerKey, sectionType, "en");
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

        createProposal({
          ownerKey: scope.cognitiveOwnerKey,
          sectionType,
          language: "en",
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
        createProposal({
          ownerKey: scope.cognitiveOwnerKey,
          sectionType,
          language: "en",
          currentContent: JSON.stringify(section.content),
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
