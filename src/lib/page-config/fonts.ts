export const AVAILABLE_FONTS = ["inter", "serif", "mono"] as const;
export type AvailableFont = (typeof AVAILABLE_FONTS)[number];

export const FONT_LABELS: Record<AvailableFont, string> = {
  inter: "Sans",
  serif: "Serif",
  mono: "Mono",
};

export const FONT_CSS_MAP: Record<
  AvailableFont,
  { heading: string; body: string }
> = {
  inter: {
    heading: "var(--font-sans, sans-serif)",
    body: "var(--font-sans, sans-serif)",
  },
  serif: {
    heading: "var(--font-serif, Georgia, serif)",
    body: "var(--font-serif, Georgia, serif)",
  },
  mono: {
    heading: "var(--font-mono, monospace)",
    body: "var(--font-mono, monospace)",
  },
};

export function isAvailableFont(value: unknown): value is AvailableFont {
  return (
    typeof value === "string" &&
    (AVAILABLE_FONTS as readonly string[]).includes(value)
  );
}
