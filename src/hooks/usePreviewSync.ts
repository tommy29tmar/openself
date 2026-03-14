"use client";

import { useEffect, useRef } from "react";

export const POLL_INTERVAL = 3000; // 3 seconds

/**
 * Data emitted by the preview sync transport on each update.
 * SplitView holds all state — the hook only delivers raw data.
 */
export interface PreviewSyncData {
  config: any;
  configHash?: string;
  publishStatus?: string;
  surface?: string;
  voice?: string;
  light?: string;
  layoutTemplate?: string;
  username?: string;
}

/**
 * Pure function: fetches /api/preview and calls onUpdate with parsed data.
 * Exported for unit testing (no React dependency).
 */
export async function pollPreview(opts: {
  language: string;
  onUpdate: (data: PreviewSyncData) => void;
}): Promise<void> {
  try {
    const res = await fetch(`/api/preview?username=draft&language=${opts.language}`);
    if (res.status === 401) {
      window.location.href = "/invite";
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    if (!data.config) return;
    opts.onUpdate({
      config: data.config,
      configHash: data.configHash,
      publishStatus: data.publishStatus,
      surface: data.config.surface,
      voice: data.config.voice,
      light: data.config.light,
      layoutTemplate: data.config.layoutTemplate,
      username: data.config.username,
    });
  } catch {
    // Silently ignore polling errors
  }
}

/**
 * Transport-only hook: manages SSE connection with polling fallback.
 * Emits raw preview data via `onUpdate` callback.
 * SplitView applies the debounce guard and updates its own state.
 *
 * Callback stability: uses a ref internally so the caller doesn't
 * need to memoize onUpdate.
 */
export function usePreviewSync(opts: {
  enabled: boolean;
  language: string;
  onUpdate: (data: PreviewSyncData) => void;
}): void {
  const onUpdateRef = useRef(opts.onUpdate);
  useEffect(() => {
    onUpdateRef.current = opts.onUpdate;
  });

  const languageRef = useRef(opts.language);
  useEffect(() => {
    languageRef.current = opts.language;
  }, [opts.language]);

  useEffect(() => {
    if (!opts.enabled) return;

    let es: EventSource | null = null;
    let errorCount = 0;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const handleData = (data: any) => {
      if (!data.config) return;
      onUpdateRef.current({
        config: data.config,
        configHash: data.configHash,
        publishStatus: data.publishStatus,
        surface: data.config.surface,
        voice: data.config.voice,
        light: data.config.light,
        layoutTemplate: data.config.layoutTemplate,
        username: data.config.username,
      });
    };

    const doPoll = async () => {
      await pollPreview({
        language: languageRef.current,
        onUpdate: (d) => onUpdateRef.current(d),
      });
    };

    const startPolling = () => {
      doPoll();
      pollInterval = setInterval(doPoll, POLL_INTERVAL);
    };

    const startSSE = () => {
      es = new EventSource("/api/preview/stream");

      es.onmessage = (event) => {
        errorCount = 0;
        try {
          const data = JSON.parse(event.data);
          handleData(data);
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        errorCount++;
        if (errorCount >= 5) {
          es?.close();
          es = null;
          startPolling();
        }
      };
    };

    if (typeof EventSource !== "undefined") {
      startSSE();
    } else {
      startPolling();
    }

    return () => {
      es?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [opts.enabled, opts.language]);
}
