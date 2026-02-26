// src/lib/layout/contracts.ts — NESSUN import da schema.ts
// Shared constants to break circular deps between schema.ts and layout/types.ts

export const LAYOUT_TEMPLATES = [
  "vertical",
  "sidebar-left",
  "bento-standard",
] as const;

export type LayoutTemplateId = (typeof LAYOUT_TEMPLATES)[number];
