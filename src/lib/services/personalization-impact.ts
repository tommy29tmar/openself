import type { FactRow } from "@/lib/services/kb-service";
import {
  computeSectionFactsHash,
  SECTION_FACT_CATEGORIES,
} from "@/lib/services/personalization-hashing";
import { getActiveCopy } from "@/lib/services/section-copy-state-service";

/**
 * Detect which personalizable section types need (re-)synthesis.
 * Uses section_copy_state as delta anchor with per-section hash comparison.
 */
export function detectImpactedSections(
  publishableFacts: FactRow[],
  ownerKey: string,
  language: string,
  currentSoulHash: string,
): string[] {
  const impacted: string[] = [];

  for (const sectionType of Object.keys(SECTION_FACT_CATEGORIES)) {
    const categories = SECTION_FACT_CATEGORIES[sectionType] ?? [];
    const hasRelevantFacts = publishableFacts.some((f) =>
      categories.includes(f.category),
    );
    if (!hasRelevantFacts) continue;

    const currentFactsHash = computeSectionFactsHash(
      publishableFacts,
      sectionType,
    );
    const state = getActiveCopy(ownerKey, sectionType, language);

    if (!state) {
      impacted.push(sectionType);
      continue;
    }

    if (
      state.factsHash !== currentFactsHash ||
      state.soulHash !== currentSoulHash
    ) {
      impacted.push(sectionType);
    }
  }

  return impacted;
}
