"use client";

import type { StyleConfig } from "@/lib/page-config/schema";
import { FONT_CSS_MAP, type AvailableFont } from "@/lib/page-config/fonts";

type ThemeProviderProps = {
  theme: string;
  style: StyleConfig;
  children: React.ReactNode;
};

export function ThemeProvider({ theme, style, children }: ThemeProviderProps) {
  const fontMapping = FONT_CSS_MAP[style.fontFamily as AvailableFont];

  const cssVars: Record<string, string> = {
    "--primary-color": style.primaryColor,
  };

  if (fontMapping) {
    cssVars["--page-font-heading"] = fontMapping.heading;
    cssVars["--page-font-body"] = fontMapping.body;
  }

  return (
    <div
      data-theme={theme}
      data-color-scheme={style.colorScheme}
      data-layout={style.layout}
      style={cssVars as React.CSSProperties}
      className="min-h-screen bg-[var(--page-bg)] text-[var(--page-fg)] transition-colors duration-200"
    >
      {children}
    </div>
  );
}
