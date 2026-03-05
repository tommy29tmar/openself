import React from "react";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { LayoutComponentProps } from "./types";
import type { Section } from "@/lib/page-config/schema";

// Variant overrides applied at render time for Monolith layout.
// Bypasses widgetId auto-assignment from assignSlotsFromFacts.
// Each entry maps section.type → the variant name to inject.
const MONOLITH_VARIANT_OVERRIDES: Partial<Record<string, string>> = {
  // Named "monolith" variants (implemented in Tasks 2–5, 7–11):
  experience: "monolith",
  education: "monolith",
  achievements: "monolith",
  timeline: "monolith",
  reading: "monolith",
  music: "monolith",
  activities: "monolith",
  interests: "monolith",
  languages: "monolith",
  // Explicitly named variants:
  projects: "projects-grid",
  skills: "skills-accent-pills",
};

function applyMonolithOverride(section: Section): Section {
  const variant = MONOLITH_VARIANT_OVERRIDES[section.type];
  if (!variant) return section;
  return { ...section, variant, widgetId: undefined };
}

const BLEED_SECTIONS = new Set(["projects", "reading", "music"]);
const HERO_SECTIONS = new Set(["hero", "footer"]);

export type Lane = "hero" | "reading" | "bleed";

export function getLane(sectionType: string): Lane {
  if (HERO_SECTIONS.has(sectionType)) return "hero";
  if (BLEED_SECTIONS.has(sectionType)) return "bleed";
  return "reading";
}

// All lanes: left-aligned from the same 48px horizontal padding (matching prototype).
// On md+, use extra left padding instead of margin so the lane never overflows the viewport.
// max-width applied via inline style to correctly use CSS calc() with custom properties.
const LANE_CLASSES: Record<Lane, string> = {
  hero: "w-full px-6 md:pr-12 md:pl-[calc(48px+8%)]",
  reading: "w-full px-6 md:pr-12 md:pl-[calc(48px+8%)]",
  bleed: "w-full px-6 md:pr-12 md:pl-[calc(48px+8%)]",
};

export function getLaneClass(lane: Lane): string {
  return LANE_CLASSES[lane];
}

// Max-width includes 96px (2×48px) for the horizontal padding,
// so the content area equals reading-max / reading-max*1.35.
const LANE_MAX_WIDTHS: Partial<Record<Lane, string>> = {
  reading: "calc(var(--reading-max, 660px) + 96px)",
  bleed: "calc(var(--reading-max, 660px) * 1.35 + 96px)",
};

export function MonolithLayout({ slots, renderSection, className }: LayoutComponentProps) {
  const template = getLayoutTemplate("monolith");
  const sortedSlots = [...template.slots].sort((a, b) => a.order - b.order);

  return (
    <div className={`layout-monolith flex flex-col ${className ?? ""}`}>
      {sortedSlots.map((slot) => {
        const sections = slots[slot.id];
        if (!sections?.length) return null;
        return (
          <div key={slot.id} className="w-full">
            {sections.map((section) => {
              const lane = getLane(section.type);
              const laneClass = getLaneClass(lane);
              const isHeroOrFooter = section.type === "hero" || section.type === "footer";

              return (
                <div
                  key={section.id}
                  className="w-full"
                  style={{
                    borderBottom: section.type !== "footer" ? "1px solid var(--page-border)" : undefined,
                  }}
                >
                  <div
                    className={laneClass}
                    style={{
                      paddingTop: isHeroOrFooter ? undefined : "48px",
                      paddingBottom: isHeroOrFooter ? undefined : "48px",
                      maxWidth: LANE_MAX_WIDTHS[lane],
                    }}
                  >
                    {renderSection(applyMonolithOverride(section))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
