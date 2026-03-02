/**
 * Projection bridge: merges active section_copy_state into canonical PageConfig.
 *
 * projectCanonicalConfig() stays pure (no DB access — ADR-0009 compliance).
 * This function reads from section_copy_state and merges AFTER projection.
 * Hash guard: if factsHash or soulHash don't match, deterministic content is preserved.
 */
import type { PageConfig } from "@/lib/page-config/schema";
import { getAllActiveCopies } from "@/lib/services/section-copy-state-service";
import { isPersonalizableSection } from "@/lib/services/personalizer-schemas";
import { mergePersonalized } from "@/lib/services/personalization-merge";
import {
  computeSectionFactsHash,
  computeHash,
} from "@/lib/services/personalization-hashing";
import { filterPublishableFacts } from "@/lib/services/page-projection";
import { getActiveFacts } from "@/lib/services/kb-service";
import { getActiveSoul } from "@/lib/services/soul-service";

/**
 * Merge active personalised section copies into a canonical PageConfig.
 *
 * Only personalizable sections with matching hashes are merged.
 * Non-personalizable sections and stale copies are left untouched.
 *
 * @param canonical - The canonical PageConfig from projectCanonicalConfig()
 * @param ownerKey - The owner's cognitive key
 * @param language - The target language code
 * @returns A new PageConfig with personalised content merged where valid
 */
export function mergeActiveSectionCopy(
  canonical: PageConfig,
  ownerKey: string,
  language: string,
): PageConfig {
  // 1. Fetch all active copies for this owner + language
  const copies = getAllActiveCopies(ownerKey, language);
  if (copies.length === 0) {
    return canonical;
  }

  // 2. Build a lookup map: sectionType -> copy row
  const copyMap = new Map(copies.map((c) => [c.sectionType, c]));

  // 3. Compute current hashes for comparison
  const allFacts = getActiveFacts(ownerKey);
  const publishableFacts = filterPublishableFacts(allFacts);

  const soul = getActiveSoul(ownerKey);
  const currentSoulHash = computeHash(soul?.compiled ?? "");

  // 4. Merge section by section
  const mergedSections = canonical.sections.map((section) => {
    const sectionType = section.type;

    // Skip non-personalizable sections
    if (!isPersonalizableSection(sectionType)) {
      return section;
    }

    // Check if we have an active copy for this section type
    const copy = copyMap.get(sectionType);
    if (!copy) {
      return section;
    }

    // Hash guard: compute current facts hash for this section type
    const currentFactsHash = computeSectionFactsHash(publishableFacts, sectionType);

    // If either hash doesn't match, copy is stale — keep deterministic content
    if (copy.factsHash !== currentFactsHash || copy.soulHash !== currentSoulHash) {
      return section;
    }

    // Parse personalised content safely
    let personalizedFields: Record<string, unknown>;
    try {
      personalizedFields = JSON.parse(copy.personalizedContent);
    } catch {
      // Invalid JSON — fall back to deterministic content
      return section;
    }

    // Merge only personalizable fields
    const mergedContent = mergePersonalized(
      section.content,
      personalizedFields,
      sectionType,
    );

    return { ...section, content: mergedContent };
  });

  return { ...canonical, sections: mergedSections };
}
