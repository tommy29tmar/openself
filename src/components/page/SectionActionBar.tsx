"use client";

import React from "react";
import { Pencil, EyeOff, ChevronUp, ChevronDown } from "lucide-react";
import type { SectionAction } from "@/components/page/SectionInteractionWrapper";

type SectionActionBarProps = {
  sectionType: string;
  sectionIndex: number;
  totalSections: number;
  onAction: (action: SectionAction) => void;
};

type ActionButton = {
  icon: React.ReactNode;
  label: string;
  action: SectionAction["type"];
  show: boolean;
};

/**
 * Desktop hover action bar for page sections.
 * Positioned at top-right of section, appears on group-hover.
 * Dark bg, 4 compact buttons: edit, hide, move up, move down.
 */
export function SectionActionBar({
  sectionType,
  sectionIndex,
  totalSections,
  onAction,
}: SectionActionBarProps) {
  const buttons: ActionButton[] = [
    { icon: <Pencil size={14} />, label: "Edit", action: "edit", show: true },
    { icon: <EyeOff size={14} />, label: "Hide", action: "hide", show: true },
    { icon: <ChevronUp size={14} />, label: "Move up", action: "moveUp", show: sectionIndex > 0 },
    { icon: <ChevronDown size={14} />, label: "Move down", action: "moveDown", show: sectionIndex < totalSections - 1 },
  ];

  return (
    <div
      style={{
        position: "absolute",
        top: -6,
        right: 16,
        zIndex: 10,
        display: "flex",
        gap: 2,
        background: "#1a1a1a",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        padding: 2,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        opacity: 0,
        pointerEvents: "none",
        transition: "opacity 150ms ease",
      }}
      className="group-hover:!opacity-100 group-hover:!pointer-events-auto"
    >
      {buttons
        .filter((b) => b.show)
        .map((b) => (
          <button
            key={b.action}
            type="button"
            title={b.label}
            onClick={(e) => {
              e.stopPropagation();
              onAction({
                type: b.action,
                sectionType,
                sectionIndex,
              });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              background: "none",
              border: "none",
              borderRadius: 6,
              color: "rgba(255,255,255,0.6)",
              cursor: "pointer",
              padding: 0,
              transition: "background 150ms ease, color 150ms ease",
            }}
            onMouseOver={(e) => {
              const el = e.currentTarget;
              el.style.background = "rgba(255,255,255,0.1)";
              el.style.color = "rgba(255,255,255,0.9)";
            }}
            onMouseOut={(e) => {
              const el = e.currentTarget;
              el.style.background = "none";
              el.style.color = "rgba(255,255,255,0.6)";
            }}
          >
            {b.icon}
          </button>
        ))}
    </div>
  );
}
