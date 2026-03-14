"use client";

import { useState, useCallback, useRef } from "react";
import type { SectionAction } from "@/components/page/SectionInteractionWrapper";
import type { PageConfig, Section } from "@/lib/page-config/schema";

export interface SectionContext {
  sectionType: string;
  contentSummary: string;
  /** Pre-filled chat prompt, e.g. "[Edit Bio section] " */
  prompt: string;
}

/**
 * Extract a short text summary from a section's content for chat context.
 */
function extractContentSummary(section: Section | undefined): string {
  if (!section) return "";
  const c = section.content as Record<string, unknown> | undefined;
  if (!c) return "";
  const text = c.text || c.name || c.headline || c.title || c.role || c.description;
  if (typeof text === "string") return text.slice(0, 100);
  // Fallback: try to get something meaningful
  try {
    const json = JSON.stringify(c);
    return json.slice(0, 100);
  } catch {
    return "";
  }
}

/**
 * Hook for preview-to-chat interaction flow.
 *
 * When a user triggers "edit" on a section, this hook:
 * 1. Stores the pending context (section type + content summary + prompt)
 * 2. Exposes `consumeContext()` for ChatPanel to pick up and clear
 *
 * Usage:
 * - SplitView calls `injectSectionContext(action, config)` on section edit
 * - ChatPanel calls `consumeContext()` to get the pending context and clear it
 */
export function usePreviewInteraction() {
  const [pendingContext, setPendingContext] = useState<SectionContext | null>(null);
  const contextRef = useRef<SectionContext | null>(null);

  const injectSectionContext = useCallback(
    (action: SectionAction, config: PageConfig | null) => {
      if (action.type !== "edit") return;

      const section = config?.sections?.find((s) => s.type === action.sectionType);
      const contentSummary = action.contentSummary || extractContentSummary(section);

      // Build a localized prompt prefix
      const sectionLabel = action.sectionType.charAt(0).toUpperCase() + action.sectionType.slice(1);
      const prompt = `[Edit ${sectionLabel} section] `;

      const ctx: SectionContext = {
        sectionType: action.sectionType,
        contentSummary,
        prompt,
      };

      contextRef.current = ctx;
      setPendingContext(ctx);
    },
    [],
  );

  const consumeContext = useCallback((): SectionContext | null => {
    const ctx = contextRef.current;
    contextRef.current = null;
    setPendingContext(null);
    return ctx;
  }, []);

  return {
    pendingContext,
    injectSectionContext,
    consumeContext,
  };
}
