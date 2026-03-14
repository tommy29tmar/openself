"use client";

import React from "react";
import { MessageSquare, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { SectionAction } from "@/components/page/SectionInteractionWrapper";
import type { UiStrings } from "@/lib/i18n/ui-strings";

type SectionActionSheetProps = {
  open: boolean;
  onClose: () => void;
  sectionType: string;
  sectionIndex: number;
  totalSections: number;
  isHidden: boolean;
  onAction: (action: SectionAction) => void;
  t: UiStrings;
};

type ActionItem = {
  label: string;
  icon: React.ReactNode;
  action: SectionAction["type"];
  show: boolean;
};

/**
 * Mobile bottom sheet with section-level actions:
 * - Edit with chat
 * - Hide / Show section
 * - Move up / Move down (conditional on position)
 */
export function SectionActionSheet({
  open,
  onClose,
  sectionType,
  sectionIndex,
  totalSections,
  isHidden,
  onAction,
  t,
}: SectionActionSheetProps) {
  const actions: ActionItem[] = [
    {
      label: t.editWithChat,
      icon: <MessageSquare size={18} />,
      action: "edit",
      show: !isHidden,
    },
    {
      label: isHidden ? t.showSection : t.hideSection,
      icon: isHidden ? <Eye size={18} /> : <EyeOff size={18} />,
      action: isHidden ? "show" : "hide",
      show: true,
    },
    {
      label: t.moveUp,
      icon: <ChevronUp size={18} />,
      action: "moveUp",
      show: !isHidden && sectionIndex > 0,
    },
    {
      label: t.moveDown,
      icon: <ChevronDown size={18} />,
      action: "moveDown",
      show: !isHidden && sectionIndex < totalSections - 1,
    },
  ];

  const handleAction = (action: SectionAction["type"]) => {
    onAction({
      type: action,
      sectionType,
      sectionIndex,
    });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={sectionType}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {actions
          .filter((a) => a.show)
          .map((a) => (
            <button
              key={a.action}
              type="button"
              onClick={() => handleAction(a.action)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                minHeight: 44,
                padding: "10px 12px",
                background: "none",
                border: "none",
                borderRadius: 8,
                color: "rgba(255,255,255,0.8)",
                fontSize: 14,
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "none";
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center" }}>
                {a.icon}
              </span>
              {a.label}
            </button>
          ))}
      </div>
    </BottomSheet>
  );
}
