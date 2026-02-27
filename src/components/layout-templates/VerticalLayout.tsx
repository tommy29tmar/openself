import React from "react";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { LayoutComponentProps } from "./types";

export function VerticalLayout({ slots, renderSection, className }: LayoutComponentProps) {
  const template = getLayoutTemplate("vertical");
  const sortedSlots = [...template.slots].sort((a, b) => a.order - b.order);

  return (
    <div className={`layout-vertical max-w-5xl mx-auto flex flex-col gap-8 md:gap-12 ${className ?? ""}`}>
      {sortedSlots.map((slot) => {
        const sections = slots[slot.id];
        if (!sections?.length) return null;
        return (
          <div key={slot.id} className="slot-wide">
            {sections.map(renderSection)}
          </div>
        );
      })}
    </div>
  );
}
