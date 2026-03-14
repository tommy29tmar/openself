"use client";

import { FeedItemActions } from "./FeedItemActions";
import type { FeedItem } from "@/lib/services/activity-feed-types";
import type { UiStrings } from "@/lib/i18n/ui-strings";
import { formatProposalContent, translateSeverity } from "@/lib/i18n/format-proposal-content";
import type { CSSProperties } from "react";

interface FeedItemDetailProps {
  item: FeedItem;
  onAction: () => void;
  language: string;
  t: UiStrings;
}

export function FeedItemDetail({ item, onAction, language, t }: FeedItemDetailProps) {
  const d = item.detail;

  return (
    <div style={detailContainerStyle}>
      {d.type === "connector_error" && (
        <div>
          <DetailRow label="Error" value={d.error} />
          {d.lastSuccessfulSync && (
            <DetailRow label="Last success" value={new Date(d.lastSuccessfulSync).toLocaleDateString(language)} />
          )}
        </div>
      )}

      {d.type === "conformity_proposal" && (
        <div>
          <DetailRow label={t.activitySeverity} value={translateSeverity(d.severity, language)} />
          <DetailRow label={t.activityReason} value={d.reason} />

          <div style={diffContainerStyle}>
            <div style={diffBlockStyle}>
              <div style={diffLabelStyle}>{t.activityCurrent}</div>
              <div style={{ ...diffContentStyle, whiteSpace: "pre-line" }}>{formatProposalContent(d.currentContent, language)}</div>
            </div>
            <div style={diffBlockStyle}>
              <div style={{ ...diffLabelStyle, color: "rgba(80,200,120,0.8)" }}>{t.activityProposed}</div>
              <div style={{ ...diffContentStyle, whiteSpace: "pre-line" }}>{formatProposalContent(d.proposedContent, language)}</div>
            </div>
          </div>

          {item.status === "pending" && (
            <FeedItemActions item={item} onAction={onAction} t={t} />
          )}
        </div>
      )}

      {d.type === "soul_proposal" && (
        <div>
          {d.reason && <DetailRow label={t.activityReason} value={d.reason} />}
          <div style={diffContainerStyle}>
            <div style={diffBlockStyle}>
              <div style={{ ...diffLabelStyle, color: "rgba(80,200,120,0.8)" }}>{t.activityProposed}</div>
              <div style={diffContentStyle}>
                {Object.entries(d.proposedOverlay).map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 4 }}>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>{k}:</span>{" "}
                    <span>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {item.status === "pending" && (
            <FeedItemActions item={item} onAction={onAction} t={t} />
          )}
        </div>
      )}

      {d.type === "episodic_pattern" && (
        <div>
          <DetailRow label="Pattern" value={d.patternSummary} />
          <DetailRow label="Events" value={`${d.eventCount} occurrences`} />

          {item.status === "pending" && (
            <FeedItemActions item={item} onAction={onAction} t={t} />
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={detailRowStyle}>
      <span style={detailLabelStyle}>{label}</span>
      <span style={detailValueStyle}>{value}</span>
    </div>
  );
}

const detailContainerStyle: CSSProperties = {
  padding: "0 0 14px 44px",
};

const detailRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 6,
  fontSize: 13,
};

const detailLabelStyle: CSSProperties = {
  color: "rgba(255,255,255,0.35)",
  minWidth: 70,
  flexShrink: 0,
};

const detailValueStyle: CSSProperties = {
  color: "rgba(255,255,255,0.7)",
  wordBreak: "break-word",
};

const diffContainerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 10,
  marginBottom: 12,
};

const diffBlockStyle: CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  borderRadius: 8,
  padding: "10px 12px",
};

const diffLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "rgba(255,255,255,0.35)",
  marginBottom: 6,
};

const diffContentStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: "rgba(255,255,255,0.7)",
};
