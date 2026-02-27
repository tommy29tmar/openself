import type { FactRow } from "@/lib/services/kb-service";
import { SECTION_FACT_CATEGORIES } from "@/lib/services/personalization-hashing";

export type RichnessLevel = "empty" | "thin" | "rich";

/**
 * Classify how data-rich a section type is based on available facts.
 * - empty: 0 relevant facts
 * - thin: 1-2 relevant facts
 * - rich: 3+ relevant facts
 */
export function classifySectionRichness(
  publishableFacts: FactRow[],
  sectionType: string,
): RichnessLevel {
  const categories = SECTION_FACT_CATEGORIES[sectionType];
  if (!categories) return "empty";

  const count = publishableFacts.filter((f) =>
    categories.includes(f.category),
  ).length;

  if (count === 0) return "empty";
  if (count <= 2) return "thin";
  return "rich";
}
