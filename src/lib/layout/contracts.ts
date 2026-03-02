// src/lib/layout/contracts.ts — NESSUN import da schema.ts
// Shared constants to break circular deps between schema.ts and layout/types.ts

export const LAYOUT_TEMPLATES = [
  "monolith",
  "cinematic",
  "curator",
  "architect",
] as const;

export type LayoutTemplateId = (typeof LAYOUT_TEMPLATES)[number];

const LAYOUT_ALIASES: Record<string, LayoutTemplateId> = {
  vertical: "monolith",
  bento: "architect",
  sidebar: "curator",
  "bento-standard": "architect",
  "sidebar-left": "curator",
  "the monolith": "monolith",
  "the cinematic": "cinematic",
  "the curator": "curator",
  "the architect": "architect",
};

export function resolveLayoutAlias(value: string): string {
  const normalized = value.toLowerCase().trim();
  // 1. Check aliases (case-insensitive)
  if (LAYOUT_ALIASES[normalized]) return LAYOUT_ALIASES[normalized];
  // 2. Check if normalized is a valid canonical ID
  if ((LAYOUT_TEMPLATES as readonly string[]).includes(normalized)) return normalized;
  // 3. Fallback to original trimmed value (preserves error messages)
  return value.trim();
}
