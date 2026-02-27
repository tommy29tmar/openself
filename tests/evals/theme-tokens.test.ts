import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ── 1. CSS token tests ──────────────────────────────────────────────

const globalsPath = path.resolve(__dirname, "../../src/app/globals.css");
const globalsCss = fs.readFileSync(globalsPath, "utf-8");

describe("Theme CSS tokens in globals.css", () => {
  const themes = ["minimal", "warm", "editorial-360"] as const;
  const colorSchemes = ["light", "dark"] as const;

  for (const theme of themes) {
    for (const scheme of colorSchemes) {
      const selector = `[data-theme="${theme}"][data-color-scheme="${scheme}"]`;

      it(`defines ${selector} selector`, () => {
        expect(globalsCss).toContain(selector);
      });
    }
  }

  const requiredTokens = [
    "--page-bg",
    "--page-fg",
    "--page-fg-secondary",
    "--page-muted",
    "--page-border",
    "--page-accent",
    "--page-accent-fg",
    "--page-card-bg",
    "--page-card-border",
    "--page-card-hover",
    "--page-badge-bg",
    "--page-badge-fg",
    "--page-badge-border",
    "--page-footer-fg",
    "--page-font-heading",
    "--page-font-body",
    "--page-radius-base",
    "--page-shadow",
    "--page-shadow-lg",
  ];

  // Extract the block for a given selector
  function extractBlock(css: string, selector: string): string {
    const escaped = selector.replace(/[[\]".-]/g, "\\$&");
    const re = new RegExp(escaped + "\\s*\\{([^}]+)\\}", "g");
    const match = re.exec(css);
    return match ? match[1] : "";
  }

  for (const theme of themes) {
    describe(`[data-theme="${theme}"] light`, () => {
      const block = extractBlock(globalsCss, `[data-theme="${theme}"][data-color-scheme="light"]`);

      for (const token of requiredTokens) {
        it(`declares ${token}`, () => {
          expect(block).toContain(token);
        });
      }
    });
  }

  it("all 3 themes have --page-bg values in light mode", () => {
    const bgValues = themes.map((theme) => {
      const block = extractBlock(globalsCss, `[data-theme="${theme}"][data-color-scheme="light"]`);
      const match = block.match(/--page-bg:\s*([^;]+)/);
      return match ? match[1].trim() : null;
    });

    // All values found
    expect(bgValues.every(Boolean)).toBe(true);

    // At least 2 distinct values (themes may intentionally share a background)
    const unique = new Set(bgValues);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it("all 3 themes have different --page-accent values in light mode", () => {
    const accentValues = themes.map((theme) => {
      const block = extractBlock(globalsCss, `[data-theme="${theme}"][data-color-scheme="light"]`);
      const match = block.match(/--page-accent:\s*([^;]+)/);
      return match ? match[1].trim() : null;
    });

    expect(accentValues.every(Boolean)).toBe(true);

    const unique = new Set(accentValues);
    expect(unique.size).toBe(3);
  });

  it("all 3 themes have different --page-font-heading values in light mode", () => {
    const fontValues = themes.map((theme) => {
      const block = extractBlock(globalsCss, `[data-theme="${theme}"][data-color-scheme="light"]`);
      const match = block.match(/--page-font-heading:\s*([^;]+)/);
      return match ? match[1].trim() : null;
    });

    expect(fontValues.every(Boolean)).toBe(true);

    const unique = new Set(fontValues);
    expect(unique.size).toBe(3);
  });

  it("minimal uses sans-serif heading font", () => {
    const block = extractBlock(globalsCss, `[data-theme="minimal"][data-color-scheme="light"]`);
    expect(block).toMatch(/--page-font-heading:.*sans-serif/);
  });

  it("warm uses serif heading font", () => {
    const block = extractBlock(globalsCss, `[data-theme="warm"][data-color-scheme="light"]`);
    expect(block).toMatch(/--page-font-heading:.*serif/);
  });

  it("editorial-360 uses rounded heading font", () => {
    const block = extractBlock(globalsCss, `[data-theme="editorial-360"][data-color-scheme="light"]`);
    expect(block).toMatch(/--page-font-heading:.*font-sans|system-ui/i);
  });
});

// ── 2. Theme registry tests ─────────────────────────────────────────

describe("Theme registry", () => {
  it("getTheme resolves all 3 theme IDs", async () => {
    const { getTheme } = await import("@/themes/index");

    for (const themeId of ["minimal", "warm", "editorial-360"]) {
      const theme = getTheme(themeId);
      expect(theme).toBeDefined();
      expect(theme.Layout).toBeDefined();
      expect(typeof theme.components).toBe("object");
    }
  });

  it("getTheme falls back to editorial-360 for unknown theme", async () => {
    const { getTheme, THEMES } = await import("@/themes/index");
    const fallback = getTheme("nonexistent");
    expect(fallback).toBe(THEMES["editorial-360"]);
  });
});

// ── 3. Section components use CSS custom properties ─────────────────

describe("Section components use CSS custom properties (no hardcoded hex colors)", () => {
  const componentsDir = path.resolve(
    __dirname,
    "../../src/themes/editorial-360/components"
  );

  const componentFiles = fs
    .readdirSync(componentsDir)
    .filter((f) => f.endsWith(".tsx"));

  // These patterns indicate hardcoded theme colors that should have been converted
  const forbiddenPatterns = [
    /text-\[#[0-9a-fA-F]{6}\]/,
    /bg-\[#[0-9a-fA-F]{6}\]/,
    /border-black\//,
    /bg-black\//,
    /text-amber-/,
    /\bfont-serif\b/,
  ];

  for (const file of componentFiles) {
    it(`${file} has no hardcoded theme colors`, () => {
      const content = fs.readFileSync(path.join(componentsDir, file), "utf-8");

      for (const pattern of forbiddenPatterns) {
        const matches = content.match(pattern);
        expect(
          matches,
          `${file} still contains hardcoded value: ${matches?.[0]}`
        ).toBeNull();
      }
    });
  }

  // Positive: verify components DO use CSS custom properties
  const expectedVars = [
    "var(--page-fg)",
    "var(--page-fg-secondary)",
    "var(--page-footer-fg)",
    "var(--page-border)",
    "var(--page-font-heading)",
  ];

  it("at least some components reference key CSS custom properties", () => {
    const allContent = componentFiles
      .map((f) => fs.readFileSync(path.join(componentsDir, f), "utf-8"))
      .join("\n");

    for (const v of expectedVars) {
      expect(allContent).toContain(v);
    }
  });
});

// ── 4. Layout.tsx uses CSS custom properties ────────────────────────

describe("EditorialLayout uses CSS custom properties", () => {
  const layoutPath = path.resolve(
    __dirname,
    "../../src/themes/editorial-360/Layout.tsx"
  );
  const layoutContent = fs.readFileSync(layoutPath, "utf-8");

  it("uses var(--page-bg) instead of hardcoded background", () => {
    expect(layoutContent).toContain("var(--page-bg)");
    expect(layoutContent).not.toMatch(/bg-\[#[0-9a-fA-F]{6}\]/);
  });

  it("uses var(--page-fg) instead of hardcoded text color", () => {
    expect(layoutContent).toContain("var(--page-fg)");
    expect(layoutContent).not.toMatch(/text-\[#[0-9a-fA-F]{6}\]/);
  });
});

// ── 5. PageRenderer applies data-theme attribute ────────────────────

describe("PageRenderer applies data-theme attribute", () => {
  const rendererPath = path.resolve(
    __dirname,
    "../../src/components/page/PageRenderer.tsx"
  );
  const rendererContent = fs.readFileSync(rendererPath, "utf-8");

  it("renders data-theme attribute from config.theme", () => {
    expect(rendererContent).toContain("data-theme=");
  });

  it("renders data-color-scheme attribute from config.style.colorScheme", () => {
    expect(rendererContent).toContain("data-color-scheme=");
  });
});
