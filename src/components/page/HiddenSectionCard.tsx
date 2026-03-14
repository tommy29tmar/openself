"use client";

import React from "react";
import { EyeOff } from "lucide-react";

export type HiddenSectionCardProps = {
  sectionType: string;
  onShow?: () => void;
};

/**
 * Ghost card rendered in builder preview for hidden sections.
 * Mobile-first: 44px touch targets, dashed border, muted styling.
 */
export function HiddenSectionCard({ sectionType, onShow }: HiddenSectionCardProps) {
  return (
    <div className="mx-4 my-2 flex items-center justify-between rounded-lg border border-dashed border-[var(--page-fg,#333)]/20 bg-[var(--page-fg,#333)]/5 px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-[var(--page-fg,#888)]/60">
        <EyeOff size={16} />
        <span>{sectionType}</span>
        <span className="text-xs opacity-60">— hidden</span>
      </span>
      {onShow && (
        <button
          type="button"
          onClick={onShow}
          className="min-h-[44px] min-w-[44px] rounded-md px-3 text-sm font-medium text-[var(--page-fg,#ccc)] hover:bg-[var(--page-fg,#333)]/10 transition-colors"
        >
          Show
        </button>
      )}
    </div>
  );
}
