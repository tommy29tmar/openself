"use client";

import React, { useState, useRef, useEffect } from "react";

type CollapsibleListProps = {
  items: React.ReactNode[];
  visibleCount?: number;  // how many items to show before collapse (default: 1)
  moreLabel?: string;     // e.g. "more roles" — count is prepended automatically
};

// Exported utility: pure split logic, testable without React
export function splitItems<T>(items: T[], visibleCount: number): { visible: T[]; hidden: T[] } {
  return {
    visible: items.slice(0, visibleCount),
    hidden: items.slice(visibleCount),
  };
}

export function CollapsibleList({
  items,
  visibleCount = 1,
  moreLabel = "more",
}: CollapsibleListProps) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [expanded, items]);

  const { visible: visibleItems, hidden: hiddenItems } = splitItems(items, visibleCount);

  // Show all if within visibleCount
  if (hiddenItems.length === 0) {
    return <>{visibleItems}</>;
  }

  const hiddenCount = hiddenItems.length;

  const buttonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--page-fg2, var(--page-fg-secondary))",
    opacity: 0.6,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "8px 0",
    letterSpacing: "0.05em",
    transition: "opacity 0.15s",
  };

  return (
    <div>
      {visibleItems}
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={buttonStyle}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
        >
          <span>▾</span>
          <span>{hiddenCount} {moreLabel}</span>
        </button>
      )}
      <div
        ref={contentRef}
        style={{
          maxHeight: expanded ? `${contentHeight}px` : "0px",
          overflow: "hidden",
          transition: "max-height 0.4s ease-in-out",
        }}
      >
        {hiddenItems}
      </div>
      {expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          style={{ ...buttonStyle, marginTop: 8 }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
        >
          <span>▴</span>
          <span>collapse</span>
        </button>
      )}
    </div>
  );
}
