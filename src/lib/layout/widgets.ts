import type { ComponentType } from "@/lib/page-config/schema";
import type { SlotSize } from "./quality";
import type { Section } from "@/lib/page-config/schema";

export type WidgetDefinition = {
  id: string;
  sectionType: ComponentType;
  variant: string;
  fitsIn: SlotSize[];
  minItems?: number;
  maxItems?: number;
  label: string;
};

const WIDGET_REGISTRY: WidgetDefinition[] = [
  // Hero
  {
    id: "hero-large",
    sectionType: "hero",
    variant: "large",
    fitsIn: ["wide"],
    label: "Hero (large)",
  },
  {
    id: "hero-compact",
    sectionType: "hero",
    variant: "compact",
    fitsIn: ["wide", "half"],
    label: "Hero (compact)",
  },

  // Bio
  {
    id: "bio-full",
    sectionType: "bio",
    variant: "full",
    fitsIn: ["wide", "half"],
    label: "Bio (full)",
  },
  {
    id: "bio-tagline",
    sectionType: "bio",
    variant: "short",
    fitsIn: ["wide", "half", "third"],
    label: "Bio (tagline)",
  },

  // Skills
  {
    id: "skills-chips",
    sectionType: "skills",
    variant: "chips",
    fitsIn: ["wide", "half", "third"],
    minItems: 1,
    maxItems: 30,
    label: "Skills (chips)",
  },
  {
    id: "skills-list",
    sectionType: "skills",
    variant: "list",
    fitsIn: ["wide", "half"],
    minItems: 1,
    maxItems: 50,
    label: "Skills (list)",
  },
  {
    id: "skills-cloud",
    sectionType: "skills",
    variant: "cloud",
    fitsIn: ["wide", "half", "square"],
    minItems: 3,
    maxItems: 20,
    label: "Skills (cloud)",
  },

  // Projects
  {
    id: "projects-grid",
    sectionType: "projects",
    variant: "grid",
    fitsIn: ["wide", "half"],
    minItems: 1,
    maxItems: 12,
    label: "Projects (grid)",
  },
  {
    id: "projects-featured",
    sectionType: "projects",
    variant: "featured",
    fitsIn: ["wide"],
    minItems: 1,
    maxItems: 3,
    label: "Projects (featured)",
  },
  {
    id: "projects-list",
    sectionType: "projects",
    variant: "list",
    fitsIn: ["wide", "half", "third"],
    minItems: 1,
    maxItems: 20,
    label: "Projects (list)",
  },

  // Timeline
  {
    id: "timeline-full",
    sectionType: "timeline",
    variant: "list",
    fitsIn: ["wide", "half"],
    minItems: 1,
    maxItems: 20,
    label: "Timeline (full)",
  },

  // Interests
  {
    id: "interests-chips",
    sectionType: "interests",
    variant: "chips",
    fitsIn: ["wide", "half", "third"],
    minItems: 1,
    maxItems: 30,
    label: "Interests (chips)",
  },

  // Social
  {
    id: "social-icons",
    sectionType: "social",
    variant: "icons",
    fitsIn: ["wide", "half", "third"],
    minItems: 1,
    maxItems: 20,
    label: "Social (icons)",
  },
  {
    id: "social-buttons",
    sectionType: "social",
    variant: "buttons",
    fitsIn: ["wide", "half"],
    minItems: 1,
    maxItems: 10,
    label: "Social (buttons)",
  },

  // Footer
  {
    id: "footer-default",
    sectionType: "footer",
    variant: "footer",
    fitsIn: ["wide"],
    label: "Footer",
  },

  // Achievements
  {
    id: "achievements-list",
    sectionType: "achievements",
    variant: "list",
    fitsIn: ["wide", "half"],
    minItems: 1,
    maxItems: 20,
    label: "Achievements (list)",
  },

  // Stats
  {
    id: "stats-grid",
    sectionType: "stats",
    variant: "grid",
    fitsIn: ["wide", "half", "third"],
    minItems: 1,
    maxItems: 8,
    label: "Stats (grid)",
  },

  // Reading
  {
    id: "reading-list",
    sectionType: "reading",
    variant: "list",
    fitsIn: ["wide", "half"],
    minItems: 1,
    maxItems: 20,
    label: "Reading (list)",
  },

  // Music
  {
    id: "music-list",
    sectionType: "music",
    variant: "list",
    fitsIn: ["wide", "half"],
    minItems: 1,
    maxItems: 20,
    label: "Music (list)",
  },

  // Contact
  {
    id: "contact-card",
    sectionType: "contact",
    variant: "card",
    fitsIn: ["wide", "half", "third"],
    label: "Contact (card)",
  },

  // Custom
  {
    id: "custom-block",
    sectionType: "custom",
    variant: "block",
    fitsIn: ["wide", "half", "third"],
    label: "Custom block",
  },
];

// Pre-computed maps for fast lookup
const widgetById = new Map<string, WidgetDefinition>();
const widgetsBySectionType = new Map<ComponentType, WidgetDefinition[]>();

for (const w of WIDGET_REGISTRY) {
  widgetById.set(w.id, w);
  const list = widgetsBySectionType.get(w.sectionType) ?? [];
  list.push(w);
  widgetsBySectionType.set(w.sectionType, list);
}

export function getWidgetById(id: string): WidgetDefinition | undefined {
  return widgetById.get(id);
}

export function getWidgetsForSection(
  sectionType: ComponentType,
): WidgetDefinition[] {
  return widgetsBySectionType.get(sectionType) ?? [];
}

export function getCompatibleWidgets(
  sectionType: ComponentType,
  slotSize: SlotSize,
): WidgetDefinition[] {
  return getWidgetsForSection(sectionType).filter((w) =>
    w.fitsIn.includes(slotSize),
  );
}

export function getBestWidget(
  sectionType: ComponentType,
  slotSize: SlotSize,
): WidgetDefinition | undefined {
  const compatible = getCompatibleWidgets(sectionType, slotSize);
  return compatible[0]; // First registered is preferred
}

/**
 * Resolve the variant string for a section.
 * widgetId is source of truth; legacy variant is fallback.
 */
export function resolveVariant(section: Section): string | undefined {
  if (section.widgetId) {
    const widget = getWidgetById(section.widgetId);
    if (widget) return widget.variant;
  }
  if (section.variant) return section.variant;
  return undefined;
}

/**
 * Build a widgetId→WidgetDefinition map for the validator.
 */
export function buildWidgetMap(): Record<string, WidgetDefinition> {
  const map: Record<string, WidgetDefinition> = {};
  for (const w of WIDGET_REGISTRY) {
    map[w.id] = w;
  }
  return map;
}
