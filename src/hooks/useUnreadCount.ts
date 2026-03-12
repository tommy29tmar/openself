"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Fetches unread notification count.
 * Revalidates on:
 * - Window focus (visibilitychange)
 * - Manual refresh() call (after user actions like sync, proposal accept)
 */
export function useUnreadCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/activity-feed/unread-count");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setCount(data.count);
      }
    } catch {
      // Silently ignore — badge just won't update
    }
  }, []);

  useEffect(() => {
    refresh();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refresh]);

  return { count, refresh };
}
