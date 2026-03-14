"use client";

import { useCallback, type MutableRefObject } from "react";
import type { StyleConfig } from "@/lib/page-config/schema";
import type { LayoutTemplateId } from "@/lib/layout/contracts";
import type { PageConfig } from "@/lib/page-config/schema";

export async function persistStyle(patch: {
  surface?: string;
  voice?: string;
  light?: string;
  style?: Partial<StyleConfig>;
  layoutTemplate?: string;
}): Promise<boolean> {
  try {
    const res = await fetch("/api/draft/style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.status === 401) {
      window.location.href = "/invite";
      return false;
    }
    if (!res.ok) {
      console.warn("[settings] Failed to persist style:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[settings] Failed to persist style:", err);
    return false;
  }
}

/**
 * Creates memoized callbacks for presence style changes.
 * All handlers update state, mark lastUserEdit, and persist to API.
 */
export function usePresenceHandlers(opts: {
  setSurface: (s: string) => void;
  setVoice: (v: string) => void;
  setLight: (l: "day" | "night") => void;
  setLayoutTemplate: (t: LayoutTemplateId) => void;
  setConfig: (c: PageConfig | null) => void;
  lastUserEdit: MutableRefObject<number>;
  language: string;
}) {
  const {
    setSurface, setVoice, setLight, setLayoutTemplate, setConfig,
    lastUserEdit, language,
  } = opts;

  const handleSurfaceChange = useCallback((s: string) => {
    setSurface(s);
    lastUserEdit.current = Date.now();
    persistStyle({ surface: s });
  }, [setSurface, lastUserEdit]);

  const handleVoiceChange = useCallback((v: string) => {
    setVoice(v);
    lastUserEdit.current = Date.now();
    persistStyle({ voice: v });
  }, [setVoice, lastUserEdit]);

  const handleLightChange = useCallback((l: "day" | "night") => {
    setLight(l);
    lastUserEdit.current = Date.now();
    persistStyle({ light: l });
  }, [setLight, lastUserEdit]);

  const handleComboSelect = useCallback(async (s: string, v: string, l: string) => {
    setSurface(s);
    setVoice(v);
    setLight(l as "day" | "night");
    lastUserEdit.current = Date.now();
    await persistStyle({ surface: s, voice: v, light: l });
  }, [setSurface, setVoice, setLight, lastUserEdit]);

  const handleLayoutTemplateChange = useCallback(async (t: LayoutTemplateId) => {
    setLayoutTemplate(t);
    lastUserEdit.current = Date.now();
    const ok = await persistStyle({ layoutTemplate: t });
    if (ok) {
      lastUserEdit.current = 0;
      try {
        const res = await fetch(`/api/preview?username=draft&language=${language}`);
        if (res.ok) {
          const data = await res.json();
          if (data.config) {
            setConfig(data.config);
            if (data.config.layoutTemplate) setLayoutTemplate(data.config.layoutTemplate);
          }
        }
      } catch { /* ignore */ }
    }
  }, [setLayoutTemplate, setConfig, lastUserEdit, language]);

  // Manual fetch for avatar change refresh
  const fetchPreview = useCallback(async () => {
    try {
      const res = await fetch(`/api/preview?username=draft&language=${language}`);
      if (res.status === 401) {
        window.location.href = "/invite";
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
        if (data.config.layoutTemplate) setLayoutTemplate(data.config.layoutTemplate);
      }
    } catch {
      // Silently ignore
    }
  }, [setConfig, setLayoutTemplate, language]);

  return {
    handleSurfaceChange,
    handleVoiceChange,
    handleLightChange,
    handleComboSelect,
    handleLayoutTemplateChange,
    fetchPreview,
  };
}
