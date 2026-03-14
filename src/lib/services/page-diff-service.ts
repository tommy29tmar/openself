import type { PageConfig } from "@/lib/page-config/schema";
import { stableDeepEqual } from "@/lib/utils/stable-deep-equal";

export interface PageChange {
  sectionType: string;
  changeType: "added" | "modified" | "removed";
}

/**
 * Compute a section-level diff between the draft and published page configs.
 * Returns an empty array if either is null (nothing to compare).
 */
export function computePageDiff(
  draft: PageConfig | null,
  published: PageConfig | null,
): PageChange[] {
  if (!draft || !published) return [];

  const changes: PageChange[] = [];

  // Top-level style/presence field changes
  const TOP_LEVEL_KEYS = ["surface", "voice", "light", "layoutTemplate"] as const;
  for (const key of TOP_LEVEL_KEYS) {
    if ((draft as any)[key] !== (published as any)[key]) {
      changes.push({ sectionType: key, changeType: "modified" as const });
    }
  }

  const draftSections = new Map(draft.sections.map((s) => [s.type, s]));
  const pubSections = new Map(published.sections.map((s) => [s.type, s]));

  for (const [type, section] of draftSections) {
    if (!pubSections.has(type)) {
      changes.push({ sectionType: type, changeType: "added" });
    } else if (!stableDeepEqual(section.content, pubSections.get(type)!.content)) {
      changes.push({ sectionType: type, changeType: "modified" });
    }
  }

  for (const type of pubSections.keys()) {
    if (!draftSections.has(type)) {
      changes.push({ sectionType: type, changeType: "removed" });
    }
  }

  return changes;
}
