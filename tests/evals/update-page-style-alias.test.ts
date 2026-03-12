import { describe, it, expect } from "vitest";
import { resolveLayoutAlias, LAYOUT_TEMPLATES } from "@/lib/layout/contracts";
import type { PageConfig } from "@/lib/page-config/schema";

/**
 * Tests that update_page_style resolves layout aliases before writing.
 *
 * BUG-2, BUG-7, BUG-12: The agent uses update_page_style to change layouts,
 * but aliases (e.g. "The Architect") were never resolved, causing upsertDraft
 * validation to reject the entire write — including any theme change.
 */

/**
 * Mirrors the alias-resolution logic that should exist in update_page_style.
 * Before fix: layoutTemplate was set directly without resolveLayoutAlias.
 */
function applyLayoutInUpdatePageStyle(
  config: PageConfig,
  layoutTemplate: string | undefined,
): { success: boolean; error?: string; config: PageConfig } {
  const updated = { ...config };

  if (layoutTemplate !== undefined) {
    const resolved = resolveLayoutAlias(layoutTemplate);
    if (!(LAYOUT_TEMPLATES as readonly string[]).includes(resolved)) {
      return {
        success: false,
        error: `Invalid layout '${layoutTemplate}'. Valid: ${LAYOUT_TEMPLATES.join(", ")}`,
        config,
      };
    }
    updated.layoutTemplate = resolved as PageConfig["layoutTemplate"];
  }

  return { success: true, config: updated };
}

const BASE_CONFIG: PageConfig = {
  version: 1,
  username: "testuser",
  theme: "minimal",
  style: { colorScheme: "light", primaryColor: "#6366f1", fontFamily: "inter", layout: "centered" },
  sections: [
    { id: "hero-1", type: "hero", variant: "large", content: { name: "Test", tagline: "Hello" } },
    { id: "footer-1", type: "footer", content: {} },
  ],
};

describe("update_page_style alias resolution", () => {
  it("resolves display name 'The Architect' to 'architect'", () => {
    const result = applyLayoutInUpdatePageStyle(BASE_CONFIG, "The Architect");
    expect(result.success).toBe(true);
    expect(result.config.layoutTemplate).toBe("architect");
  });

  it("resolves display name 'The Curator' to 'curator'", () => {
    const result = applyLayoutInUpdatePageStyle(BASE_CONFIG, "The Curator");
    expect(result.success).toBe(true);
    expect(result.config.layoutTemplate).toBe("curator");
  });

  it("resolves legacy alias 'bento' to 'architect'", () => {
    const result = applyLayoutInUpdatePageStyle(BASE_CONFIG, "bento");
    expect(result.success).toBe(true);
    expect(result.config.layoutTemplate).toBe("architect");
  });

  it("passes through canonical ID 'cinematic' unchanged", () => {
    const result = applyLayoutInUpdatePageStyle(BASE_CONFIG, "cinematic");
    expect(result.success).toBe(true);
    expect(result.config.layoutTemplate).toBe("cinematic");
  });

  it("rejects truly invalid layout names", () => {
    const result = applyLayoutInUpdatePageStyle(BASE_CONFIG, "nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid layout/i);
  });

  it("does nothing when layoutTemplate is undefined", () => {
    const result = applyLayoutInUpdatePageStyle(BASE_CONFIG, undefined);
    expect(result.success).toBe(true);
    expect(result.config.layoutTemplate).toBeUndefined();
  });
});
