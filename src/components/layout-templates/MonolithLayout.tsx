import React from "react";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { LayoutComponentProps } from "./types";
import type { Section } from "@/lib/page-config/schema";

const BLEED_SECTIONS = new Set(["projects", "reading", "music"]);
const DENSE_SECTIONS = new Set(["stats", "skills", "interests", "languages", "activities", "social", "contact"]);
const HERO_SECTIONS = new Set(["hero", "footer"]);

export type Lane = "hero" | "reading" | "bleed";

export function getLane(sectionType: string): Lane {
  if (HERO_SECTIONS.has(sectionType)) return "hero";
  if (BLEED_SECTIONS.has(sectionType)) return "bleed";
  return "reading";
}

export function getSpacingClass(sectionType: string, isLastBeforeFooter: boolean): string {
  if (sectionType === "hero") return "mb-20";
  if (isLastBeforeFooter) return "mb-20";
  if (DENSE_SECTIONS.has(sectionType)) return "mb-8";
  return "mb-12";
}

const LANE_CLASSES: Record<Lane, string> = {
  hero: "w-full",
  reading: "w-full max-w-[var(--reading-max,660px)] mx-auto px-6 md:px-12",
  bleed: "w-full max-w-[calc(var(--reading-max,660px)*1.35)] mx-auto px-6 md:px-12",
};

export function MonolithLayout({ slots, renderSection, className }: LayoutComponentProps) {
  const template = getLayoutTemplate("monolith");
  const sortedSlots = [...template.slots].sort((a, b) => a.order - b.order);

  // Flatten all sections in slot order to detect last-before-footer
  const allSections: { section: Section; slotId: string }[] = [];
  for (const slot of sortedSlots) {
    const sections = slots[slot.id];
    if (!sections?.length) continue;
    for (const section of sections) {
      allSections.push({ section, slotId: slot.id });
    }
  }

  // Find the last non-footer section index
  const lastNonFooterIdx = allSections.findLastIndex(
    (s) => s.section.type !== "footer"
  );

  let globalIdx = 0;

  return (
    <div className={`layout-monolith flex flex-col ${className ?? ""}`}>
      {sortedSlots.map((slot) => {
        const sections = slots[slot.id];
        if (!sections?.length) return null;
        return (
          <div key={slot.id} className="w-full">
            {sections.map((section) => {
              const currentIdx = globalIdx++;
              const isLastBeforeFooter = currentIdx === lastNonFooterIdx;
              const spacingClass = section.type === "footer"
                ? ""
                : getSpacingClass(section.type, isLastBeforeFooter);
              const lane = getLane(section.type);
              const laneClass = LANE_CLASSES[lane];

              return (
                <div key={section.id} className={`${laneClass} ${spacingClass}`}>
                  {renderSection(section)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
