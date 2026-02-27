import { PERSONALIZABLE_FIELDS } from "@/lib/services/personalizer-schemas";

/**
 * Merge personalised text fields into original section content.
 *
 * Only fields listed in PERSONALIZABLE_FIELDS for the given section type
 * are overwritten. All other fields from originalContent are preserved
 * untouched. Non-string values in personalizedFields are ignored.
 *
 * Returns a new object (no mutation).
 */
export function mergePersonalized(
  originalContent: Record<string, unknown>,
  personalizedFields: Record<string, unknown>,
  sectionType: string,
): Record<string, unknown> {
  const allowedFields = PERSONALIZABLE_FIELDS[sectionType];
  if (!allowedFields) return originalContent;

  const merged = { ...originalContent };
  for (const field of allowedFields) {
    if (field in personalizedFields && typeof personalizedFields[field] === "string") {
      merged[field] = personalizedFields[field];
    }
  }
  return merged;
}
