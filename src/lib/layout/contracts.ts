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
};

export function resolveLayoutAlias(value: string): string {
  return LAYOUT_ALIASES[value] ?? value;
}
