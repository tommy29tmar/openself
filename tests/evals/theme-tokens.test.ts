import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ── 1. globals.css Presence System tests ────────────────────────────

const globalsPath = path.resolve(__dirname, "../../src/app/globals.css");
const globalsCss = fs.readFileSync(globalsPath, "utf-8");

describe("Presence system CSS in globals.css", () => {
  // Core selectors that must exist
  const requiredSelectors = [
    ".os-page",
    ".os-page.surface-clay",
    ".os-page.surface-archive",
    ".os-page.light-night",
    ".os-page.voice-narrative",
    ".os-page.voice-terminal",
  ];

  for (const selector of requiredSelectors) {
    it(`defines selector: ${selector}`, () => {
      expect(globalsCss).toContain(selector);
    });
  }

  // Required CSS custom properties on .os-page base
  const requiredTokens = [
    "--page-bg",
    "--page-fg",
    "--page-fg-secondary",
    "--page-accent",
    "--page-accent-fg",
    "--page-border",
    "--page-muted",
    "--page-card-bg",
    "--page-card-border",
    "--page-card-hover",
    "--page-font-heading",
    "--page-font-body",
    "--page-badge-bg",
    "--page-badge-fg",
    "--page-badge-border",
    "--page-footer-fg",
    "--page-radius-base",
    "--page-shadow",
    "--page-shadow-lg",
  ];

  // Extract the block for a given selector
  function extractBlock(css: string, selector: string): string {
    // Escape special characters for the literal selector in regex
    const escaped = selector.replace(/[[\].]/g, "\\$&");
    const re = new RegExp(escaped + "\\s*\\{([^}]+)\\}");
    const match = re.exec(css);
    return match ? match[1] : "";
  }

  const baseBlock = extractBlock(globalsCss, ".os-page");

  for (const token of requiredTokens) {
    it(`.os-page declares ${token}`, () => {
      expect(baseBlock).toContain(token);
    });
  }

  it(".os-page base has --page-bg value", () => {
    const match = baseBlock.match(/--page-bg:\s*([^;]+)/);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBeTruthy();
  });

  it(".os-page base has --page-accent value", () => {
    const match = baseBlock.match(/--page-accent:\s*([^;]+)/);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBeTruthy();
  });

  it(".os-page.surface-clay has different --page-bg than canvas base", () => {
    const canvasBg = baseBlock.match(/--page-bg:\s*([^;]+)/)?.[1]?.trim();
    const clayBlock = extractBlock(globalsCss, ".os-page.surface-clay");
    const clayBg = clayBlock.match(/--page-bg:\s*([^;]+)/)?.[1]?.trim();
    expect(canvasBg).toBeTruthy();
    expect(clayBg).toBeTruthy();
    expect(canvasBg).not.toBe(clayBg);
  });

  it(".os-page.surface-archive has different --page-bg than canvas base", () => {
    const canvasBg = baseBlock.match(/--page-bg:\s*([^;]+)/)?.[1]?.trim();
    const archiveBlock = extractBlock(globalsCss, ".os-page.surface-archive");
    const archiveBg = archiveBlock.match(/--page-bg:\s*([^;]+)/)?.[1]?.trim();
    expect(canvasBg).toBeTruthy();
    expect(archiveBg).toBeTruthy();
    // Archive is #ffffff (white) while canvas is off-white — they differ
    expect(canvasBg).not.toBe(archiveBg);
  });

  it(".os-page.light-night has dark --page-bg", () => {
    const nightBlock = extractBlock(globalsCss, ".os-page.light-night");
    const bg = nightBlock.match(/--page-bg:\s*([^;]+)/)?.[1]?.trim();
    expect(bg).toBeTruthy();
    // Night mode should start with #0 (dark color)
    expect(bg).toMatch(/^#0/);
  });

  it(".os-page.voice-narrative uses serif heading font", () => {
    const narrativeBlock = extractBlock(globalsCss, ".os-page.voice-narrative");
    expect(narrativeBlock).toContain("--h-font");
    expect(narrativeBlock).toContain("serif");
  });

  it(".os-page.voice-terminal uses monospace font", () => {
    const terminalBlock = extractBlock(globalsCss, ".os-page.voice-terminal");
    expect(terminalBlock).toContain("--h-font");
    expect(terminalBlock).toContain("monospace");
  });

  it("canvas base uses sans-serif heading font (Signal)", () => {
    expect(baseBlock).toContain("--h-font");
    expect(baseBlock).toContain("sans-serif");
  });
});

// ── 2. Presence registry tests ───────────────────────────────────────

describe("Presence registry", () => {
  it("listSurfaces returns all 3 surfaces", async () => {
    const { listSurfaces } = await import("@/lib/presence");

    const surfaces = listSurfaces();
    expect(surfaces).toHaveLength(3);
    const ids = surfaces.map((s) => s.id);
    expect(ids).toContain("canvas");
    expect(ids).toContain("clay");
    expect(ids).toContain("archive");
  });

  it("listVoices returns all 3 voices", async () => {
    const { listVoices } = await import("@/lib/presence");

    const voices = listVoices();
    expect(voices).toHaveLength(3);
    const ids = voices.map((v) => v.id);
    expect(ids).toContain("signal");
    expect(ids).toContain("narrative");
    expect(ids).toContain("terminal");
  });

  it("isValidSurface accepts canvas, clay, archive", async () => {
    const { isValidSurface } = await import("@/lib/presence");

    expect(isValidSurface("canvas")).toBe(true);
    expect(isValidSurface("clay")).toBe(true);
    expect(isValidSurface("archive")).toBe(true);
  });

  it("isValidSurface rejects unknown values", async () => {
    const { isValidSurface } = await import("@/lib/presence");

    expect(isValidSurface("minimal")).toBe(false);
    expect(isValidSurface("warm")).toBe(false);
    expect(isValidSurface("hacker")).toBe(false);
    expect(isValidSurface("")).toBe(false);
  });

  it("isValidVoice accepts signal, narrative, terminal", async () => {
    const { isValidVoice } = await import("@/lib/presence");

    expect(isValidVoice("signal")).toBe(true);
    expect(isValidVoice("narrative")).toBe(true);
    expect(isValidVoice("terminal")).toBe(true);
  });

  it("isValidVoice rejects unknown values", async () => {
    const { isValidVoice } = await import("@/lib/presence");

    expect(isValidVoice("bold")).toBe(false);
    expect(isValidVoice("inter")).toBe(false);
    expect(isValidVoice("")).toBe(false);
  });

  it("isValidLight accepts day and night", async () => {
    const { isValidLight } = await import("@/lib/presence");

    expect(isValidLight("day")).toBe(true);
    expect(isValidLight("night")).toBe(true);
  });

  it("isValidLight rejects unknown values", async () => {
    const { isValidLight } = await import("@/lib/presence");

    expect(isValidLight("dark")).toBe(false);
    expect(isValidLight("light")).toBe(false);
    expect(isValidLight("")).toBe(false);
  });

  it("each surface has required fields", async () => {
    const { listSurfaces } = await import("@/lib/presence");

    for (const s of listSurfaces()) {
      expect(s.id).toBeTruthy();
      expect(s.displayName).toBeTruthy();
      expect(s.cssClass).toBeTruthy();
      expect(typeof s.readingMax).toBe("number");
      expect(typeof s.sectionLabelOpacity).toBe("number");
    }
  });

  it("each voice has required fields", async () => {
    const { listVoices } = await import("@/lib/presence");

    for (const v of listVoices()) {
      expect(v.id).toBeTruthy();
      expect(v.displayName).toBeTruthy();
      expect(v.cssClass).toBeTruthy();
      expect(v.headingFont).toBeTruthy();
      expect(v.bodyFont).toBeTruthy();
    }
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

// ── 4. OsPageWrapper applies presence classes ────────────────────────

describe("OsPageWrapper applies presence classes", () => {
  const wrapperPath = path.resolve(
    __dirname,
    "../../src/components/page/OsPageWrapper.tsx"
  );
  const wrapperContent = fs.readFileSync(wrapperPath, "utf-8");

  it("applies os-page base class", () => {
    expect(wrapperContent).toContain('"os-page"');
  });

  it("applies surface-clay class for clay surface", () => {
    expect(wrapperContent).toContain("surface-${surface}");
  });

  it("applies light-night class for night light", () => {
    expect(wrapperContent).toContain("light-night");
  });

  it("applies voice-narrative/terminal class for non-default voice", () => {
    expect(wrapperContent).toContain("voice-${voice}");
  });

  it("reads surface, voice, light from config", () => {
    expect(wrapperContent).toContain("config.surface");
    expect(wrapperContent).toContain("config.voice");
    expect(wrapperContent).toContain("config.light");
  });
});

// ── 5. PageRenderer renders sections ────────────────────────────────

describe("PageRenderer renders sections", () => {
  const rendererPath = path.resolve(
    __dirname,
    "../../src/components/page/PageRenderer.tsx"
  );
  const rendererContent = fs.readFileSync(rendererPath, "utf-8");

  it("renders data-section attribute for sections", () => {
    expect(rendererContent).toContain("data-section=");
  });

  it("maps section types to components", () => {
    expect(rendererContent).toContain("section.type");
  });
});
