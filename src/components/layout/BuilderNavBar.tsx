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
  onSettingsOpen?: () => void;
};

export function BuilderNavBar({
  authState,
  hasUnpublishedChanges,
  publishing,
  publishError,
  onPublish,
  onSignup,
  onSettingsOpen,
}: BuilderNavBarProps) {
  const [loggingOut, setLoggingOut] = useState(false);

  const authenticated = authState?.authenticated ?? false;
  const username = authState?.username ?? null;
  const publishedUsername = authState?.publishedUsername ?? null;

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
    <div className="sticky top-0 z-50 flex min-h-12 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Brand */}
      <a href="/" className="text-sm font-semibold tracking-tight">
        OpenSelf
      </a>

      {/* Live page link */}
      {publishedUsername && (
        <a
          href={`/${publishedUsername}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Live page
        </a>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Publish error */}
      {publishError && (
        <span className="text-xs text-red-600 dark:text-red-400">{publishError}</span>
      )}

      {/* Publish / Sign up button */}
      {hasUnpublishedChanges && !publishing && authenticated && (
        <button
          onClick={onPublish}
          className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700"
        >
          {username ? `Publish as ${username}` : "Publish"}
        </button>
      )}

      {hasUnpublishedChanges && !publishing && !authenticated && (
        <button
          onClick={onSignup}
          className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700"
        >
          Sign up to publish
        </button>
      )}

      {publishing && (
        <span className="text-sm text-muted-foreground">Publishing...</span>
      )}

      {/* User info + logout */}
      {authenticated && username && (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">{username}</span>
          <span className="text-muted-foreground">&middot;</span>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {loggingOut ? "..." : "Log out"}
          </button>
        </div>
      )}

      {/* Settings — always last */}
      {onSettingsOpen && (
        <button
          onClick={onSettingsOpen}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Customize"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="2" y1="3.5" x2="14" y2="3.5" />
            <line x1="2" y1="8" x2="14" y2="8" />
            <line x1="2" y1="12.5" x2="14" y2="12.5" />
            <circle cx="5" cy="3.5" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="11" cy="8" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="8" cy="12.5" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        </button>
      )}
    </div>
  );
}
