import type { Section } from "@/lib/page-config/schema";
import type { SlotAssignment } from "./quality";

/**
 * Mapping esplicito per sezioni legacy (type+variant → widgetId).
 * Avoids building synthetic IDs that don't exist in the registry.
 */
const LEGACY_WIDGET_MAP: Record<string, string> = {
  "hero:large": "hero-large",
  "hero:compact": "hero-compact",
  "bio:full": "bio-full",
  "bio:short": "bio-tagline",
  "skills:chips": "skills-chips",
  "skills:list": "skills-list",
  "skills:cloud": "skills-cloud",
  "projects:grid": "projects-grid",
  "projects:featured": "projects-featured",
  "projects:list": "projects-list",
  "timeline:list": "timeline-full",
  "interests:chips": "interests-chips",
  "social:icons": "social-icons",
  "social:buttons": "social-buttons",
  "footer:footer": "footer-default",
  // Default fallbacks (no variant)
  "hero:default": "hero-large",
  "bio:default": "bio-full",
  "skills:default": "skills-chips",
  "projects:default": "projects-grid",
  "timeline:default": "timeline-full",
  "interests:default": "interests-chips",
  "social:default": "social-icons",
  "footer:default": "footer-default",
  "achievements:default": "achievements-list",
  "achievements:list": "achievements-list",
  "stats:default": "stats-grid",
  "stats:grid": "stats-grid",
  "reading:default": "reading-list",
  "reading:list": "reading-list",
  "music:default": "music-list",
  "music:list": "music-list",
  "contact:default": "contact-card",
  "contact:card": "contact-card",
  "custom:default": "custom-block",
  "custom:block": "custom-block",
};

export type SkippedSection = {
  sectionId: string;
  sectionType: string;
  reason: string;
};

export type SlotAssignmentResult = {
  assignments: SlotAssignment[];
  skipped: SkippedSection[];
};

/**
 * Bridge Section[] → SlotAssignment[] for the validator.
 *
 * Returns per-section outcome: each section ends up in `assignments` (ok)
 * or in `skipped` (with explicit reason). The publish gate uses
 * `skipped` to decide whether to block.
 */
export function toSlotAssignments(sections: Section[]): SlotAssignmentResult {
  const assignments: SlotAssignment[] = [];
  const skipped: SkippedSection[] = [];

  for (const s of sections) {
    if (!s.slot) {
      skipped.push({
        sectionId: s.id,
        sectionType: s.type,
        reason: "missing slot",
      });
      continue;
    }

    // 1. widgetId esplicito (pagine nuove)
    if (s.widgetId) {
      assignments.push({
        slotId: s.slot,
        widgetId: s.widgetId,
        itemCount: countItems(s),
      });
      continue;
    }

    // 2. Mapping legacy esplicito (pagine migrate)
    const legacyKey = `${s.type}:${s.variant ?? "default"}`;
    const mappedWidget = LEGACY_WIDGET_MAP[legacyKey];
    if (mappedWidget) {
      assignments.push({
        slotId: s.slot,
        widgetId: mappedWidget,
        itemCount: countItems(s),
      });
      continue;
    }

    // 3. No mapping → tracked in skipped with reason
    skipped.push({
      sectionId: s.id,
      sectionType: s.type,
      reason: `no widgetId and no legacy mapping for ${legacyKey}`,
    });
  }

  return { assignments, skipped };
}

function countItems(section: Section): number {
  const c = section.content;
  if (Array.isArray(c.items)) return c.items.length;
  if (Array.isArray(c.groups)) return c.groups.length;
  if (Array.isArray(c.links)) return c.links.length;
  return 1;
}

/**
 * True if the section has slot + (widgetId or match in LEGACY_WIDGET_MAP).
 * Used by publish gate to decide if in-memory assignment is needed.
 */
export function canFullyValidateSection(section: Section): boolean {
  if (!section.slot) return false;
  if (section.widgetId) return true;
  return canResolveLegacyWidget(section);
}

/**
 * True if type+variant of the section has a match in LEGACY_WIDGET_MAP.
 */
export function canResolveLegacyWidget(section: Section): boolean {
  const legacyKey = `${section.type}:${section.variant ?? "default"}`;
  return legacyKey in LEGACY_WIDGET_MAP;
}
