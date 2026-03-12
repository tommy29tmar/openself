"use client";

import type { CSSProperties } from "react";
import type { FeedItem as FeedItemType } from "@/lib/services/activity-feed-types";
import type { UiStrings } from "@/lib/i18n/ui-strings";
import { FeedItemDetail } from "./FeedItemDetail";

interface FeedItemComponentProps {
  item: FeedItemType;
  expanded: boolean;
  onToggle: () => void;
  onAction: () => void;
  language: string;
  t: UiStrings;
}

function relativeTimeDisplay(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const CONNECTOR_LABELS: Record<string, string> = {
  github: "GitHub",
  linkedin_zip: "LinkedIn",
  rss: "RSS",
  spotify: "Spotify",
  strava: "Strava",
};

function getItemTitle(item: FeedItemType, t: UiStrings): string {
  const d = item.detail;
  switch (d.type) {
    case "connector_sync": {
      const label = CONNECTOR_LABELS[d.connectorType] ?? d.connectorType;
      return `${label} ${t.activitySynced}: ${d.factsCreated} ${t.activityFacts}, ${d.eventsCreated} ${t.activityEvents}`;
    }
    case "connector_error": {
      const label = CONNECTOR_LABELS[d.connectorType] ?? d.connectorType;
      return `${label} ${t.activitySyncFailed}`;
    }
    case "conformity_proposal":
      return t.activityConformity;
    case "soul_proposal":
      return t.activitySoul;
    case "episodic_pattern":
      return t.activityEpisodicPattern;
    default:
      return "Notification";
  }
}

const TYPE_ICONS: Record<string, string> = {
  connector_sync: "↻",
  connector_error: "⚠",
  conformity_proposal: "✦",
  soul_proposal: "◈",
  episodic_pattern: "◉",
};

export function FeedItemComponent({
  item,
  expanded,
  onToggle,
  onAction,
  language,
  t,
}: FeedItemComponentProps) {
  const isResolved = item.status && item.status !== "pending";

  return (
    <div style={containerStyle}>
      <button
        type="button"
        onClick={onToggle}
        style={summaryRowStyle}
      >
        <span style={iconStyle(item.category)}>
          {TYPE_ICONS[item.type] ?? "•"}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={titleRowStyle(isResolved)}>
            {getItemTitle(item, t)}
          </div>
        </div>

        <div style={timeStyle}>
          {relativeTimeDisplay(item.createdAt)}
        </div>
        <span style={chevronStyle(expanded)}>›</span>
      </button>

      {expanded && (
        <FeedItemDetail
          item={item}
          onAction={onAction}
          language={language}
          t={t}
        />
      )}

      {isResolved && (
        <div style={resolvedBadgeStyle}>
          {t.activityResolved} ✓
        </div>
      )}
    </div>
  );
}

const containerStyle: CSSProperties = {
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  position: "relative",
};

const summaryRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "14px 0",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "rgba(255,255,255,0.85)",
  textAlign: "left",
  fontSize: 14,
};

function iconStyle(category: string): CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    flexShrink: 0,
    background:
      category === "actionable"
        ? "rgba(201,169,110,0.15)"
        : "rgba(255,255,255,0.06)",
    color:
      category === "actionable"
        ? "#c9a96e"
        : "rgba(255,255,255,0.5)",
  };
}

function titleRowStyle(resolved?: boolean): CSSProperties {
  return {
    fontSize: 14,
    fontWeight: 500,
    color: resolved ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.85)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textDecoration: resolved ? "line-through" : "none",
  };
}

const timeStyle: CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.3)",
  flexShrink: 0,
  minWidth: 28,
  textAlign: "right",
};

function chevronStyle(expanded: boolean): CSSProperties {
  return {
    fontSize: 16,
    color: "rgba(255,255,255,0.2)",
    transform: expanded ? "rotate(90deg)" : "none",
    transition: "transform 0.15s",
    flexShrink: 0,
  };
}

const resolvedBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 14,
  right: 0,
  fontSize: 10,
  color: "rgba(80,200,120,0.7)",
  fontWeight: 600,
};
