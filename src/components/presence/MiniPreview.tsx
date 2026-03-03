"use client";
import { OsPageWrapper } from "@/components/page/OsPageWrapper";
import type { PageConfig } from "@/lib/page-config/schema";

type MiniPreviewProps = {
  config: PageConfig;
};

const MINI_CONFIG = {
  version: 1,
  username: "preview",
  surface: "canvas",
  voice: "signal",
  light: "day",
  style: { primaryColor: "#c9a96e", layout: "centered" as const },
  sections: [
    { id: "h", type: "hero" as const, content: { name: "Elena Vasquez", tagline: "Senior Product Designer" } },
    { id: "b", type: "bio" as const, content: { text: "I design products at the intersection of system thinking and human warmth." } },
    { id: "s", type: "skills" as const, content: { groups: [] } },
  ],
  layoutTemplate: "monolith" as const,
} satisfies PageConfig;

export function MiniPreview({ config }: MiniPreviewProps) {
  const previewConfig: PageConfig = {
    ...MINI_CONFIG,
    surface: config.surface,
    voice: config.voice,
    light: config.light,
  };
  return (
    <div style={{ height: 320, overflow: "hidden", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ transform: "scale(0.5)", transformOrigin: "top left", width: "200%", height: "200%", pointerEvents: "none" }}>
        <OsPageWrapper config={previewConfig} previewMode>
          <div style={{ padding: "24px 32px" }}>
            <div style={{ fontFamily: "var(--h-font)", fontSize: 36, fontWeight: 600, color: "var(--page-fg)", marginBottom: 8 }}>
              Elena Vasquez
            </div>
            <div style={{ fontSize: 14, color: "var(--page-fg-secondary)", marginBottom: 24 }}>
              Senior Product Designer
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span style={{ width: 3, height: 16, background: "var(--page-accent)", borderRadius: 2, display: "inline-block" }} />
              <span style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--page-fg)", opacity: "var(--section-label-opacity)" as unknown as number }}>About</span>
            </div>
            <p style={{ fontFamily: "var(--b-font)", fontSize: 14, lineHeight: 1.8, color: "var(--page-fg)", maxWidth: "58ch" }}>
              I design products at the intersection of system thinking and human warmth.
            </p>
          </div>
        </OsPageWrapper>
      </div>
    </div>
  );
}
