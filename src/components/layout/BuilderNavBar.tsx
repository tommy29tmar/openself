"use client";
import { useState } from "react";
import type { AuthState } from "@/app/builder/page";

type BuilderNavBarProps = {
  authState?: AuthState;
  hasUnpublishedChanges: boolean;
  publishing: boolean;
  publishError: string | null;
  onPublish: () => void;
  onSignup: () => void;
  onPresenceOpen?: () => void;
  publishedUsername?: string | null;
};

export function BuilderNavBar({
  authState,
  hasUnpublishedChanges,
  publishing,
  publishError,
  onPublish,
  onSignup,
  onPresenceOpen,
  publishedUsername: publishedUsernameProp,
}: BuilderNavBarProps) {
  const authenticated = authState?.authenticated ?? false;
  const username = authState?.username ?? null;
  const publishedUsername = publishedUsernameProp ?? authState?.publishedUsername ?? null;
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } catch {
      setLoggingOut(false);
    }
  };

  return (
    <div
      style={{
        position: "sticky", top: 0, zIndex: 50,
        height: 48, display: "flex", alignItems: "center", gap: 16,
        padding: "0 20px",
        background: "rgba(7,7,9,0.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Logo */}
      <a
        href="/"
        style={{
          fontFamily: "var(--font-jetbrains, monospace)", fontSize: 13,
          fontWeight: 500, color: "#e8e4de", letterSpacing: "0.02em",
          textDecoration: "none", flexShrink: 0,
        }}
      >
        openself
      </a>

      {/* Status pill */}
      {(username || publishedUsername) && (
        <a
          href={publishedUsername ? `/${publishedUsername}` : undefined}
          style={{
            fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11,
            padding: "3px 10px", borderRadius: 4,
            background: "rgba(201,169,110,0.15)", color: "#c9a96e",
            textDecoration: "none", flexShrink: 0,
          }}
        >
          {publishedUsername ? `Published · ${publishedUsername}` : `Draft · ${username}`}
        </a>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Publish error */}
      {publishError && (
        <span style={{ fontSize: 12, color: "#f87171" }}>{publishError}</span>
      )}

      {/* Presence button */}
      {onPresenceOpen && (
        <button
          onClick={onPresenceOpen}
          style={{
            fontFamily: "var(--font-figtree, sans-serif)", fontSize: 12,
            fontWeight: 500, padding: "6px 14px", borderRadius: 6,
            background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)",
            border: "none", cursor: "pointer",
          }}
        >
          Presence
        </button>
      )}

      {/* Logout */}
      {authenticated && (
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            fontFamily: "var(--font-figtree, sans-serif)", fontSize: 11,
            padding: "4px 10px", borderRadius: 5, cursor: "pointer",
            background: "none", color: "rgba(255,255,255,0.35)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {loggingOut ? "…" : "Log out"}
        </button>
      )}

      {/* Publish button */}
      {hasUnpublishedChanges && !publishing && authenticated && (
        <button
          onClick={onPublish}
          style={{
            fontFamily: "var(--font-figtree, sans-serif)", fontSize: 12,
            fontWeight: 500, padding: "6px 16px", borderRadius: 6,
            background: "#c9a96e", color: "#111", border: "none", cursor: "pointer",
          }}
        >
          Publish →
        </button>
      )}
      {hasUnpublishedChanges && !publishing && !authenticated && (
        <button
          onClick={onSignup}
          style={{
            fontFamily: "var(--font-figtree, sans-serif)", fontSize: 12,
            fontWeight: 500, padding: "6px 16px", borderRadius: 6,
            background: "#c9a96e", color: "#111", border: "none", cursor: "pointer",
          }}
        >
          Sign up to publish
        </button>
      )}
      {publishing && (
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Publishing…</span>
      )}
    </div>
  );
}
