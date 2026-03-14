"use client";

import React, { useRef, useEffect, useCallback, useState, useMemo } from "react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

const SWIPE_DISMISS_PX = 60;

/**
 * Reusable mobile bottom sheet.
 * - Body scroll lock on open
 * - Escape key handler
 * - Focus trap via `inert` on `<main>`
 * - Swipe-to-dismiss (delta > 60px)
 * - role="dialog", aria-modal="true", aria-labelledby
 * - z-[400] backdrop, z-[401] sheet
 * - Slide-up animation with prefers-reduced-motion support
 * - env(safe-area-inset-bottom) padding
 */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const translateYRef = useRef(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [translateY, setTranslateY] = useState(0);
  const [closing, setClosing] = useState(false);
  const titleId = useMemo(
    () => `bottom-sheet-title-${title.replace(/\s+/g, "-").toLowerCase()}`,
    [title],
  );

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus trap via inert on all body children except the sheet elements
  useEffect(() => {
    if (!open) return;
    const exclude = new Set<Element>();
    if (backdropRef.current) exclude.add(backdropRef.current);
    if (sheetRef.current) exclude.add(sheetRef.current);
    const siblings = Array.from(document.body.children).filter(
      (el) => !exclude.has(el) && el instanceof HTMLElement,
    ) as HTMLElement[];
    siblings.forEach((el) => el.setAttribute("inert", ""));
    return () => {
      siblings.forEach((el) => el.removeAttribute("inert"));
    };
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Auto-focus sheet on open
  useEffect(() => {
    if (open && sheetRef.current) {
      sheetRef.current.focus();
    }
  }, [open]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    translateYRef.current = 0;
    setTranslateY(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - touchStartY.current;
    // Only allow downward swipe
    if (delta > 0) {
      translateYRef.current = delta;
      setTranslateY(delta);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (translateYRef.current > SWIPE_DISMISS_PX) {
      setClosing(true);
      dismissTimerRef.current = setTimeout(() => {
        setClosing(false);
        translateYRef.current = 0;
        setTranslateY(0);
        onClose();
      }, 200);
    } else {
      translateYRef.current = 0;
      setTranslateY(0);
    }
  }, [onClose]);

  // Cleanup dismiss timer on unmount
  useEffect(() => () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  if (!open && !closing) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="bottom-sheet-slide-up"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 401,
          background: "#1a1a1e",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          transform: closing ? "translateY(100%)" : `translateY(${translateY}px)`,
          transition: translateY > 0 && !closing ? "none" : "transform 200ms ease-out",
          outline: "none",
          maxHeight: "70vh",
          overflowY: "auto",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }} />
        </div>
        {/* Title */}
        <div id={titleId} style={{ padding: "4px 20px 12px", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.7)", letterSpacing: "0.02em" }}>
          {title}
        </div>
        {/* Content */}
        <div style={{ padding: "0 8px 16px" }}>
          {children}
        </div>
      </div>
    </>
  );
}
