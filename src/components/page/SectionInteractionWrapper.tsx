"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";

export type SectionAction = {
  type: "edit" | "hide" | "show" | "moveUp" | "moveDown";
  sectionType: string;
  sectionIndex: number;
  contentSummary?: string;
};

type SectionInteractionWrapperProps = {
  children: React.ReactNode;
  sectionType: string;
  sectionIndex: number;
  totalSections: number;
  onAction: (action: SectionAction) => void;
  /** Desktop action bar component rendered on hover */
  actionBar?: React.ReactNode;
};

const LONG_PRESS_MS = 300;
const SCROLL_CANCEL_PX = 10;

/**
 * Wraps a page section with interaction handlers.
 * - Desktop: hover triggers `group` class for action bar visibility
 * - Mobile: long-press (300ms) fires onAction with type "edit"
 *   Cancelled if user scrolls >10px. Vibration feedback on trigger.
 */
export function SectionInteractionWrapper({
  children,
  sectionType,
  sectionIndex,
  onAction,
  actionBar,
}: SectionInteractionWrapperProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const cancelledRef = useRef(false);
  const [pressed, setPressed] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPressed(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      cancelledRef.current = false;
      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
      setPressed(true);

      timerRef.current = setTimeout(() => {
        if (!cancelledRef.current) {
          // Vibration feedback
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(30);
          }
          onAction({
            type: "edit",
            sectionType,
            sectionIndex,
          });
        }
        setPressed(false);
        timerRef.current = null;
      }, LONG_PRESS_MS);
    },
    [onAction, sectionType, sectionIndex],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const deltaX = Math.abs(e.touches[0].clientX - startXRef.current);
      const deltaY = Math.abs(e.touches[0].clientY - startYRef.current);
      if (deltaX > SCROLL_CANCEL_PX || deltaY > SCROLL_CANCEL_PX) {
        cancelledRef.current = true;
        clearTimer();
      }
    },
    [clearTimer],
  );

  const handleTouchEnd = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      className="group relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={handleContextMenu}
      style={{
        userSelect: "none",
        WebkitTouchCallout: "none",
        outline: pressed ? "2px solid rgba(201,169,110,0.4)" : "none",
        outlineOffset: -2,
        borderRadius: 8,
        transition: "outline-color 150ms ease",
      }}
    >
      {actionBar}
      <div style={{ position: "relative", zIndex: 0 }}>{children}</div>
    </div>
  );
}
