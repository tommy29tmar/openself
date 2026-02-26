import React from "react";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { LayoutComponentProps } from "./types";

export function SidebarLayout({ slots, renderSection, className }: LayoutComponentProps) {
  const template = getLayoutTemplate("sidebar-left");
  const sortedSlots = [...template.slots].sort((a, b) => a.order - b.order);

  // Slot grid config: hero and footer are full-width, main and sidebar split
  const SLOT_GRID: Record<string, string> = {
    hero: "col-span-full",
    main: "md:col-span-7",
    sidebar: "md:col-span-5",
    footer: "col-span-full",
  };

  return (
    <div className={`layout-sidebar-left grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-12 max-w-6xl mx-auto ${className ?? ""}`}>
      {sortedSlots.map((slot) => {
        const sections = slots[slot.id];
        if (!sections?.length) return null;
        const gridClass = SLOT_GRID[slot.id] ?? "";
        const sizeClass = slot.size === "wide" ? "slot-wide" : "slot-half";
        return (
          <div
            key={slot.id}
            className={`${gridClass} ${sizeClass} flex flex-col gap-8`}
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
