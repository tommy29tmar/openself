"use client";

import { useState, type CSSProperties } from "react";
import type { FeedItem } from "@/lib/services/activity-feed-types";
import type { UiStrings } from "@/lib/i18n/ui-strings";

interface FeedItemActionsProps {
  item: FeedItem;
  onAction: () => void;
  t: UiStrings;
}

export function FeedItemActions({ item, onAction, t }: FeedItemActionsProps) {
  const [loading, setLoading] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (accept: boolean) => {
    setLoading(accept ? "accept" : "reject");
    setError(null);

    try {
      const d = item.detail;
      let res: Response;

      if (d.type === "conformity_proposal") {
        const endpoint = accept
          ? `/api/proposals/${d.proposalId}/accept`
          : `/api/proposals/${d.proposalId}/reject`;
        res = await fetch(endpoint, { method: "POST" });
      } else if (d.type === "soul_proposal") {
        res = await fetch("/api/soul/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposalId: d.proposalId, accept }),
        });
      } else if (d.type === "episodic_pattern") {
        res = await fetch("/api/episodic/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: d.proposalId, accept }),
        });
      } else {
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }

      onAction();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={actionsContainerStyle}>
      {error && <div style={errorStyle}>{error}</div>}
      <div style={buttonsRowStyle}>
        <button
          type="button"
          onClick={() => handleAction(true)}
          disabled={loading !== null}
          style={acceptButtonStyle}
        >
          {loading === "accept" ? "…" : t.activityAccept}
        </button>
        <button
          type="button"
          onClick={() => handleAction(false)}
          disabled={loading !== null}
          style={rejectButtonStyle}
        >
          {loading === "reject" ? "…" : t.activityReject}
        </button>
      </div>
    </div>
  );
}

const actionsContainerStyle: CSSProperties = {
  marginTop: 8,
};

const buttonsRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
};

const acceptButtonStyle: CSSProperties = {
  padding: "14px 20px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  background: "rgba(80,200,120,0.15)",
  color: "rgba(80,200,120,0.9)",
  border: "1px solid rgba(80,200,120,0.2)",
  cursor: "pointer",
  flex: 1,
  minHeight: 44,
};

const rejectButtonStyle: CSSProperties = {
  padding: "14px 20px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.4)",
  border: "1px solid rgba(255,255,255,0.08)",
  cursor: "pointer",
  flex: 1,
  minHeight: 44,
};

const errorStyle: CSSProperties = {
  fontSize: 12,
  color: "#e53e3e",
  marginBottom: 6,
};
