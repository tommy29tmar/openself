import { createHash } from "node:crypto";
import type { FactRow } from "@/lib/services/kb-service";

/**
 * SHA-256 hex hash of any string.
 */
export function computeHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Map of personalizable section types to their relevant fact categories.
 * Used for per-section hashing and impact detection.
 */
export const SECTION_FACT_CATEGORIES: Record<string, string[]> = {
  hero: ["identity"],
  bio: ["identity", "interest"],
  skills: ["skill"],
  projects: ["project"],
  interests: ["interest", "hobby"],
  achievements: ["achievement"],
  stats: ["stat"],
  reading: ["reading"],
  music: ["music"],
  experience: ["experience"],
  education: ["education"],
  languages: ["language"],
  activities: ["activity", "hobby"],
  "at-a-glance": ["skill", "stat", "interest"],
};

/**
 * Compute a per-section hash from publishable facts filtered to relevant categories.
 * Visibility is excluded from the hash (promote proposed→public doesn't invalidate).
 * Facts are sorted by key for deterministic output.
 *
 * NOTE: `id` is intentionally excluded — for clustered facts the primary id can
 * change when a higher-priority source joins the cluster, which would falsely
 * invalidate section copy state even though the visible content is unchanged.
 */
export function computeSectionFactsHash(
  publishableFacts: FactRow[],
  sectionType: string,
): string {
  const categories = SECTION_FACT_CATEGORIES[sectionType] ?? [];
  const relevant = publishableFacts
    .filter((f) => categories.includes(f.category))
    .sort((a, b) => a.key.localeCompare(b.key));

  return computeHash(
    JSON.stringify(
      relevant.map((f) => ({
        category: f.category,
        key: f.key,
        value: f.value,
      })),
    ),
  );
}
