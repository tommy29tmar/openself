"use client";

interface MobilePreviewHeaderProps {
  hasUnpublishedChanges: boolean;
  publishing: boolean;
  authenticated: boolean;
  publishError: string | null;
  loggingOut: boolean;
  onPublish: () => void;
  onSignup: () => void;
  onPresenceOpen: () => void;
  onLogout: () => void;
}

/**
 * Sticky header bar for mobile preview tab.
 * Contains: logo, Presence button, Publish/Sign up, logout.
 */
export function MobilePreviewHeader({
  hasUnpublishedChanges,
  publishing,
  authenticated,
  publishError,
  loggingOut,
  onPublish,
  onSignup,
  onPresenceOpen,
  onLogout,
}: MobilePreviewHeaderProps) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 10,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "0 16px", height: 44,
      background: "rgba(7,7,9,0.92)",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      flexShrink: 0,
    }}>
      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#c9a96e" }}>openself</span>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onPresenceOpen}
          style={{
            background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)",
            border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer",
            minHeight: 44,
          }}
        >
          Presence
        </button>
        {hasUnpublishedChanges && !publishing && authenticated && (
          <button
            type="button"
            onClick={onPublish}
            style={{
              background: "#c9a96e", color: "#111", border: "none",
              borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
              minHeight: 44,
            }}
          >
            Publish &rarr;
          </button>
        )}
        {hasUnpublishedChanges && !publishing && !authenticated && (
          <button
            type="button"
            onClick={onSignup}
            style={{
              background: "#c9a96e", color: "#111", border: "none",
              borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
              minHeight: 44,
            }}
          >
            Sign up &rarr;
          </button>
        )}
        {publishing && (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Publishing&hellip;</span>
        )}
        {publishError && !publishing && (
          <span style={{ fontSize: 11, color: "#f87171" }}>{publishError}</span>
        )}
        {authenticated && (
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            style={{
              background: "none", color: "rgba(255,255,255,0.35)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5,
              padding: "4px 10px", fontSize: 11, cursor: "pointer",
              minHeight: 44,
            }}
          >
            {loggingOut ? "\u2026" : "Log out"}
          </button>
        )}
      </div>
    </div>
  );
}
