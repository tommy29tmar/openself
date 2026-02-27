import { z, type ZodObject } from "zod";

/**
 * Map of section types to their personalizable text fields.
 * Only these fields may be overwritten by LLM personalisation.
 */
export const PERSONALIZABLE_FIELDS: Record<string, string[]> = {
  hero: ["tagline"],
  bio: ["description"],
  skills: ["description"],
  projects: ["description"],
  interests: ["description"],
  achievements: ["description"],
  experience: ["description"],
  education: ["description"],
  reading: ["description"],
  music: ["description"],
  activities: ["description"],
};

/**
 * Maximum word budget per section for personalised copy.
 */
export const MAX_WORDS: Record<string, number> = {
  hero: 15,
  bio: 120,
  skills: 60,
  projects: 80,
  interests: 60,
  achievements: 60,
  experience: 80,
  education: 60,
  reading: 60,
  music: 60,
  activities: 60,
};

/**
 * Returns true if the given section type supports personalisation.
 */
export function isPersonalizableSection(sectionType: string): boolean {
  return sectionType in PERSONALIZABLE_FIELDS;
}

/**
 * Build a strict Zod schema for the personalizable fields of a section type.
 * Returns null for non-personalizable types.
 */
export function getPersonalizerSchema(
  sectionType: string,
): ZodObject<Record<string, z.ZodString>> | null {
  const fields = PERSONALIZABLE_FIELDS[sectionType];
  if (!fields) return null;

  const shape: Record<string, z.ZodString> = {};
  for (const field of fields) {
    shape[field] = z.string();
  }
  return z.object(shape).strict();
}
