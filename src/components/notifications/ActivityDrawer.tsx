"use client";

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { FeedItemComponent } from "./FeedItem";
import type { FeedItem } from "@/lib/services/activity-feed-types";
import type { UiStrings } from "@/lib/i18n/ui-strings";

interface ActivityDrawerProps {
  open: boolean;
  onClose: () => void;
  language: string;
  t: UiStrings;
  isMobile: boolean;
  onUnreadRefresh: () => void;
  bellRef?: React.RefObject<HTMLButtonElement | null>;
}

export function ActivityDrawer({
  open,
  onClose,
  language,
  t,
  isMobile,
  onUnreadRefresh,
  bellRef,
}: ActivityDrawerProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/activity-feed?limit=30");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setItems(data.items);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchFeed();
      const timer = setTimeout(async () => {
        try {
          await fetch("/api/activity-feed/mark-viewed", { method: "POST" });
          onUnreadRefresh();
        } catch { /* silent */ }
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setExpandedId(null);
    }
  }, [open, fetchFeed, onUnreadRefresh]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Close on click outside (desktop only) — excludes bell button
  useEffect(() => {
    if (!open || isMobile) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (bellRef?.current?.contains(target)) return;
      if (drawerRef.current && !drawerRef.current.contains(target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, isMobile, onClose, bellRef]);

  const handleItemAction = useCallback(() => {
    fetchFeed();
    onUnreadRefresh();
  }, [fetchFeed, onUnreadRefresh]);

  if (!open) return null;

  const drawerStyle: CSSProperties = isMobile
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#0e0e10",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }
    : {
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 480,
        zIndex: 70,
        background: "#0e0e10",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        overflowY: "auto",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
      };

  return (
    <>
      {!isMobile && (
        <div
          onClick={onClose}
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 60,
          }}
        />
      )}

      <div ref={drawerRef} style={drawerStyle}>
        <div style={headerStyle(isMobile)}>
          {isMobile && (
            <button type="button" onClick={onClose} style={closeButtonStyle} aria-label={t.closeDrawer}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M12.7 5.3a1 1 0 00-1.4 0L7 9.6a.5.5 0 000 .7l4.3 4.4a1 1 0 001.4-1.4L9.4 10l3.3-3.3a1 1 0 000-1.4z" />
              </svg>
            </button>
          )}

          <h2 style={titleStyle}>{t.activityTitle}</h2>

          <div style={{ flex: 1 }} />

          {items.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/activity-feed/mark-viewed", { method: "POST" });
                onUnreadRefresh();
              }}
              style={markAllReadStyle}
            >
              {t.activityMarkAllRead}
            </button>
          )}

          {!isMobile && (
            <button type="button" onClick={onClose} style={closeButtonStyle} aria-label={t.closeDrawer}>
              ✕
            </button>
          )}
        </div>

        <div style={{ padding: isMobile ? "0 16px 24px" : "0 20px 24px" }}>
          {loading && items.length === 0 && (
            <div style={emptyStyle}>
              <div style={{ opacity: 0.4 }}>...</div>
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-lg font-medium" style={{ color: "var(--page-fg, #ccc)" }}>{t.allClear}</p>
              <p className="mt-2 text-sm" style={{ color: "var(--page-fg, #888)" }}>{t.noNotifications}</p>
            </div>
          )}

          {items.map((item) => (
            <FeedItemComponent
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onAction={handleItemAction}
              language={language}
              t={t}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function headerStyle(isMobile: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: isMobile ? "16px 16px 12px" : "20px 20px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    position: "sticky",
    top: 0,
    background: "#0e0e10",
    zIndex: 1,
  };
}

const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "rgba(255,255,255,0.9)",
  margin: 0,
};

const closeButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.5)",
  cursor: "pointer",
  padding: 10,
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16,
  minWidth: 44,
  minHeight: 44,
};

const markAllReadStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.4)",
  cursor: "pointer",
  fontSize: 12,
  padding: "4px 8px",
  minHeight: 44,
  minWidth: 44,
};

const emptyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  paddingTop: 80,
  color: "rgba(255,255,255,0.5)",
};
