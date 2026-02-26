import React from "react";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { LayoutComponentProps } from "./types";

const SLOT_GRID: Record<string, { colSpan: string }> = {
  hero: { colSpan: "col-span-full" },
  "feature-left": { colSpan: "col-span-full md:col-span-3" },
  "feature-right": { colSpan: "col-span-full md:col-span-3" },
  "full-row": { colSpan: "col-span-full" },
  "card-1": { colSpan: "col-span-full md:col-span-2" },
  "card-2": { colSpan: "col-span-full md:col-span-2" },
  "card-3": { colSpan: "col-span-full md:col-span-2" },
  footer: { colSpan: "col-span-full" },
};

export function BentoLayout({ slots, renderSection, className }: LayoutComponentProps) {
  const template = getLayoutTemplate("bento-standard");
  const sortedSlots = [...template.slots].sort((a, b) => a.order - b.order);

  // Map slot size to CSS class
  const slotSizeClass = (size: string): string => {
    switch (size) {
      case "wide":
        return "slot-wide";
      case "half":
        return "slot-half";
      case "third":
        return "slot-third";
      default:
        return "";
    }
  };

  return (
    <div className={`layout-bento-standard grid grid-cols-1 gap-6 md:grid-cols-6 md:gap-8 max-w-6xl mx-auto ${className ?? ""}`}>
      {sortedSlots.map((slot) => {
        const sections = slots[slot.id];
        if (!sections?.length) return null;
        const grid = SLOT_GRID[slot.id] ?? { colSpan: "" };
        return (
          <div
            key={slot.id}
            className={`${grid.colSpan} ${slotSizeClass(slot.size)}`}
            style={{
              order: slot.mobileOrder,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ["--md-order" as any]: slot.order,
            }}
          >
            {sections.map(renderSection)}
          </div>
        );
      })}
    </div>
  );
}
