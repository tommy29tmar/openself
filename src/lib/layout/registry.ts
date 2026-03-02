import type { LayoutTemplateId } from "./contracts";
import type { LayoutTemplateDefinition } from "./types";
import type { PageConfig } from "@/lib/page-config/schema";

const LAYOUT_REGISTRY: Record<LayoutTemplateId, LayoutTemplateDefinition> = {
  monolith: {
    id: "monolith",
    name: "The Monolith",
    description: "Classic single-column flow",
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
  cinematic: {
    id: "cinematic",
    name: "Cinematic",
    description: "Immersive snap-scrolling journey",
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
  curator: {
    id: "curator",
    name: "The Curator",
    description: "Editorial split-screen experience",
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
  architect: {
    id: "architect",
    name: "The Architect",
    description: "Dynamic asymmetric bento grid",
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
        affinity: { bio: 90, experience: 80, education: 70, projects: 60 },
        order: 1,
        mobileOrder: 1,
      },
      {
        id: "feature-right",
        size: "half",
        required: false,
        maxSections: 1,
        accepts: ["skills", "interests", "stats", "achievements", "at-a-glance"],
        affinity: { skills: 90, interests: 80, stats: 80, achievements: 70, "at-a-glance": 60 },
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
        affinity: { projects: 90, experience: 80, achievements: 70, reading: 60, music: 60, education: 50 },
        order: 3,
        mobileOrder: 2,
      },
      {
        id: "card-1",
        size: "third",
        required: false,
        maxSections: 1,
        accepts: ["skills", "interests", "social", "stats", "contact", "languages", "activities", "reading", "education", "achievements", "music"],
        affinity: { stats: 90, contact: 80, languages: 70, social: 60, skills: 50, interests: 50, activities: 40 },
        order: 4,
        mobileOrder: 4,
      },
      {
        id: "card-2",
        size: "third",
        required: false,
        maxSections: 1,
        accepts: ["skills", "interests", "social", "stats", "contact", "languages", "activities", "reading", "education", "achievements", "music"],
        affinity: { skills: 80, interests: 80, social: 70, languages: 60, activities: 50, stats: 40 },
        order: 5,
        mobileOrder: 5,
      },
      {
        id: "card-3",
        size: "third",
        required: false,
        maxSections: 1,
        accepts: ["skills", "interests", "social", "stats", "contact", "languages", "activities", "reading", "education", "achievements", "music"],
        affinity: { activities: 80, reading: 70, music: 70, education: 60, achievements: 50 },
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
  return LAYOUT_REGISTRY[id] ?? LAYOUT_REGISTRY["monolith"];
}

/**
 * Resolve the layout template for a PageConfig.
 * Only looks at config.layoutTemplate. style.layout is completely ignored.
 * Without an explicit layoutTemplate → always "monolith".
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
  return LAYOUT_REGISTRY["monolith"];
}

export function getAllTemplates(): LayoutTemplateDefinition[] {
  return Object.values(LAYOUT_REGISTRY);
}
