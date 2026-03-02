import React from "react";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { LayoutComponentProps } from "./types";

const SLOT_GRID: Record<string, { colSpan: string; rowSpan?: string }> = {
  hero: { colSpan: "col-span-1 md:col-span-2", rowSpan: "md:row-span-2" },
  "feature-left": { colSpan: "col-span-1 md:col-span-2" },
  "feature-right": { colSpan: "col-span-1 md:col-span-2" },
  "full-row": { colSpan: "col-span-1 md:col-span-4" },
  "card-1": { colSpan: "col-span-1 md:col-span-1" },
  "card-2": { colSpan: "col-span-1 md:col-span-1" },
  "card-3": { colSpan: "col-span-1 md:col-span-2" },
  footer: { colSpan: "col-span-1 md:col-span-4" },
};

export function ArchitectLayout({ slots, renderSection, className }: LayoutComponentProps) {
  const template = getLayoutTemplate("architect");
  const sortedSlots = [...template.slots].sort((a, b) => a.order - b.order);

  // Map slot size to CSS class for typography scaling inside the bento boxes
  const slotSizeClass = (size: string): string => {
    switch (size) {
      case "wide": return "slot-wide";
      case "half": return "slot-half";
      case "third": return "slot-third";
      default: return "";
    }
  };

  return (
    <div className={`layout-architect grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 auto-rows-[minmax(220px,auto)] max-w-6xl mx-auto ${className ?? ""}`}>
      {sortedSlots.map((slot) => {
        const sections = slots[slot.id];
        if (!sections?.length) return null;
        const grid = SLOT_GRID[slot.id] ?? { colSpan: "col-span-1 md:col-span-2" };
        
        return (
          <div
            key={slot.id}
            className={`${grid.colSpan} ${grid.rowSpan || ""} ${slotSizeClass(slot.size)} flex flex-col gap-6`}
            style={{
              order: slot.mobileOrder,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ["--md-order" as any]: slot.order,
            }}
          >
            {sections.map((section, idx) => (
              <div 
                key={idx} 
                className="os-card h-full w-full bg-[var(--page-bg)] border border-[var(--page-border)] rounded-[1.5rem] p-8 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-black/20 dark:hover:border-white/20"
              >
                {renderSection(section)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
