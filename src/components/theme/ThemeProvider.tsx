"use client";

// ThemeProvider is a passthrough wrapper.
// The CSS theming system is being rewritten in Task 8 (globals.css rewrite) to use
// CSS classes on .os-page via data-surface / data-voice / data-light attributes.
// fontFamily and colorScheme CSS-var logic has been removed as part of Design DNA migration.

type ThemeProviderProps = {
  children: React.ReactNode;
  // Legacy props kept to avoid breaking callers until Task 17 (Clean Cut).
  theme?: string;
  style?: Record<string, unknown>;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  return <>{children}</>;
}
