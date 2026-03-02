import React from "react";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { LayoutComponentProps } from "./types";

/** Section types that get compact (32px) gap after them */
const DENSE_SECTIONS = new Set([
  "stats", "skills", "interests", "languages", "activities", "social",
]);

/** Section types that get medium (48px) gap after them */
const NARRATIVE_SECTIONS = new Set([
  "bio", "experience", "education", "projects", "achievements",
  "reading", "music", "contact", "custom", "timeline",
]);

function getSpacingClass(sectionType: string, isLastBeforeFooter: boolean): string {
  if (sectionType === "hero") return "mb-20"; // 80px after hero
  if (isLastBeforeFooter) return "mb-20";     // 80px before footer
  if (DENSE_SECTIONS.has(sectionType)) return "mb-8";  // 32px
  if (NARRATIVE_SECTIONS.has(sectionType)) return "mb-12"; // 48px
  return "mb-12"; // default
}

export function MonolithLayout({ slots, renderSection, className }: LayoutComponentProps) {
  const template = getLayoutTemplate("monolith");
  const sortedSlots = [...template.slots].sort((a, b) => a.order - b.order);

  // Flatten all sections in slot order to detect last-before-footer
  const allSections: { section: any; slotId: string }[] = [];
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
    <div className={`layout-monolith max-w-5xl mx-auto flex flex-col ${className ?? ""}`}>
      {sortedSlots.map((slot) => {
        const sections = slots[slot.id];
        if (!sections?.length) return null;
        return (
          <div key={slot.id} className="slot-wide">
            {sections.map((section) => {
              const currentIdx = globalIdx++;
              const isLastBeforeFooter = currentIdx === lastNonFooterIdx;
              const spacingClass = section.type === "footer"
                ? ""
                : getSpacingClass(section.type, isLastBeforeFooter);

              return (
                <div key={section.id} className={spacingClass}>
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
