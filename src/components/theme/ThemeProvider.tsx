"use client";

import type { StyleConfig } from "@/lib/page-config/schema";

type ThemeProviderProps = {
  theme: string;
  style: StyleConfig;
  children: React.ReactNode;
};

export function ThemeProvider({ theme, style, children }: ThemeProviderProps) {
  return (
    <div
      data-theme={theme}
      data-color-scheme={style.colorScheme}
      data-layout={style.layout}
      style={{ "--primary-color": style.primaryColor } as React.CSSProperties}
      className="min-h-screen bg-[var(--page-bg)] text-[var(--page-fg)] transition-colors duration-200"
    >
      {children}
    </div>
  );
}
