import type { Section } from "@/lib/page-config/schema";
import type { SlotAssignment } from "./quality";

/**
 * Mapping esplicito per sezioni legacy (type+variant → widgetId).
 * Avoids building synthetic IDs that don't exist in the registry.
 */
const LEGACY_WIDGET_MAP: Record<string, string> = {
  "hero:large": "hero-split",
  "hero:compact": "hero-compact",
  "hero:default": "hero-split",
  "bio:full": "bio-dropcap",
  "bio:short": "bio-tagline",
  "bio:default": "bio-dropcap",
  "skills:chips": "skills-chips",
  "skills:list": "skills-list",
  "skills:cloud": "skills-cloud",
  "skills:default": "skills-chips",
  "projects:grid": "projects-list",
  "projects:featured": "projects-bento",
  "projects:list": "projects-list",
  "projects:default": "projects-list",
  "timeline:list": "timeline-full",
  "timeline:default": "timeline-full",
  "interests:chips": "interests-chips",
  "interests:default": "interests-chips",
  "social:icons": "social-icons",
  "social:buttons": "social-buttons",
  "social:default": "social-icons",
  "footer:footer": "footer-default",
  "footer:default": "footer-default",
  "achievements:default": "achievements-list",
  "achievements:list": "achievements-list",
  "stats:default": "stats-grid",
  "stats:grid": "stats-grid",
  "at-a-glance:full": "at-a-glance-full",
  "at-a-glance:default": "at-a-glance-full",
  "reading:default": "reading-list",
  "reading:list": "reading-list",
  "music:default": "music-list",
  "music:list": "music-list",
  "contact:default": "contact-card",
  "contact:card": "contact-card",
  "custom:default": "custom-block",
  "custom:block": "custom-block",
  "experience:default": "experience-timeline",
  "experience:timeline": "experience-timeline",
  "education:default": "education-cards",
  "education:cards": "education-cards",
  "languages:default": "languages-list",
  "languages:list": "languages-list",
  "activities:default": "activities-list",
  "activities:list": "activities-list",
  "activities:compact": "activities-compact",
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
  if (Array.isArray(c.methods)) return c.methods.length;
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
