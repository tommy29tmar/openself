import type { LayoutTemplateId } from "./contracts";
import type { LayoutTemplateDefinition } from "./types";
import type { PageConfig } from "@/lib/page-config/schema";

const LAYOUT_REGISTRY: Record<LayoutTemplateId, LayoutTemplateDefinition> = {
  vertical: {
    id: "vertical",
    name: "Vertical",
    description: "Classic single-column layout",
    heroSlot: "hero",
    footerSlot: "footer",
    slots: [
      {
        id: "hero",
        size: "wide",
        required: true,
        maxSections: 1,
        accepts: ["hero"],
        order: 0,
        mobileOrder: 0,
      },
      {
        id: "main",
        size: "wide",
        required: false,
        maxSections: 20,
        accepts: [
          "bio",
          "skills",
          "projects",
          "timeline",
          "interests",
          "social",
          "achievements",
          "stats",
          "at-a-glance",
          "reading",
          "music",
          "contact",
          "custom",
          "experience",
          "education",
          "languages",
          "activities",
        ],
        order: 1,
        mobileOrder: 1,
      },
      {
        id: "footer",
        size: "wide",
        required: true,
        maxSections: 1,
        accepts: ["footer"],
        order: 99,
        mobileOrder: 99,
      },
    ],
  },
  "sidebar-left": {
    id: "sidebar-left",
    name: "Sidebar",
    description: "Two-column layout with main content and sidebar",
    heroSlot: "hero",
    footerSlot: "footer",
    slots: [
      {
        id: "hero",
        size: "wide",
        required: true,
        maxSections: 1,
        accepts: ["hero"],
        order: 0,
        mobileOrder: 0,
      },
      {
        id: "main",
        size: "half",
        required: true,
        maxSections: 10,
        accepts: [
          "bio",
          "projects",
          "timeline",
          "achievements",
          "at-a-glance",
          "reading",
          "music",
          "custom",
          "experience",
          "education",
          "activities",
        ],
        order: 1,
        mobileOrder: 1,
      },
      {
        id: "sidebar",
        size: "half",
        required: false,
        maxSections: 6,
        accepts: ["bio", "skills", "interests", "social", "stats", "contact", "languages", "activities"],
        order: 2,
        mobileOrder: 2,
      },
      {
        id: "footer",
        size: "wide",
        required: true,
        maxSections: 1,
        accepts: ["footer"],
        order: 99,
        mobileOrder: 99,
      },
    ],
  },
  "bento-standard": {
    id: "bento-standard",
    name: "Bento",
    description: "Magazine-style grid with cards of varying sizes",
    heroSlot: "hero",
    footerSlot: "footer",
    slots: [
      {
        id: "hero",
        size: "wide",
        required: true,
        maxSections: 1,
        accepts: ["hero"],
        order: 0,
        mobileOrder: 0,
      },
      {
        id: "feature-left",
        size: "half",
        required: false,
        maxSections: 1,
        accepts: ["bio", "projects", "timeline", "experience", "education"],
        order: 1,
        mobileOrder: 1,
      },
      {
        id: "feature-right",
        size: "half",
        required: false,
        maxSections: 1,
        accepts: ["skills", "interests", "stats", "achievements", "at-a-glance"],
        order: 2,
        mobileOrder: 3,
      },
      {
        id: "full-row",
        size: "wide",
        required: false,
        maxSections: 2,
        accepts: [
          "projects",
          "timeline",
          "achievements",
          "at-a-glance",
          "reading",
          "music",
          "custom",
          "experience",
          "education",
          "activities",
        ],
        order: 3,
        mobileOrder: 2,
      },
      {
        id: "card-1",
        size: "third",
        required: false,
        maxSections: 1,
        accepts: ["skills", "interests", "social", "stats", "contact", "languages", "activities"],
        order: 4,
        mobileOrder: 4,
      },
      {
        id: "card-2",
        size: "third",
        required: false,
        maxSections: 1,
        accepts: ["skills", "interests", "social", "stats", "contact", "languages", "activities"],
        order: 5,
        mobileOrder: 5,
      },
      {
        id: "card-3",
        size: "third",
        required: false,
        maxSections: 1,
        accepts: ["skills", "interests", "social", "stats", "contact", "languages", "activities"],
        order: 6,
        mobileOrder: 6,
      },
      {
        id: "footer",
        size: "wide",
        required: true,
        maxSections: 1,
        accepts: ["footer"],
        order: 99,
        mobileOrder: 99,
      },
    ],
  },
};

export function getLayoutTemplate(
  id: LayoutTemplateId,
): LayoutTemplateDefinition {
  return LAYOUT_REGISTRY[id] ?? LAYOUT_REGISTRY["vertical"];
}

/**
 * Resolve the layout template for a PageConfig.
 * Only looks at config.layoutTemplate. style.layout is completely ignored.
 * Without an explicit layoutTemplate → always "vertical".
 */
export function resolveLayoutTemplate(
  config: PageConfig,
): LayoutTemplateDefinition {
  const id = (config as Record<string, unknown>).layoutTemplate as
    | string
    | undefined;
  if (id && id in LAYOUT_REGISTRY) {
    return LAYOUT_REGISTRY[id as LayoutTemplateId];
  }
  return LAYOUT_REGISTRY["vertical"];
}

export function getAllTemplates(): LayoutTemplateDefinition[] {
  return Object.values(LAYOUT_REGISTRY);
}
