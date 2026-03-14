import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("theme-reveal CSS", () => {
  const css = readFileSync("src/app/globals.css", "utf-8");

  it("should have pointer-events: none on .theme-reveal", () => {
    const match = css.match(/(?<=\n)\.theme-reveal\s*\{([^}]+)\}/);
    expect(match).toBeTruthy();
    expect(match![1]).toContain("pointer-events: none");
  });

  it("should have pointer-events: auto on .theme-reveal.revealed", () => {
    const match = css.match(/\.theme-reveal\.revealed\s*\{([^}]+)\}/);
    expect(match).toBeTruthy();
    expect(match![1]).toContain("pointer-events: auto");
  });

  it("should have pointer-events: auto on .preview-mode .theme-reveal", () => {
    const match = css.match(/\.preview-mode\s+\.theme-reveal\s*\{([^}]+)\}/);
    expect(match).toBeTruthy();
    expect(match![1]).toContain("pointer-events: auto");
  });

  it("should have pointer-events: auto in prefers-reduced-motion block", () => {
    const reducedBlock = css.match(/prefers-reduced-motion[\s\S]*?\.theme-reveal\s*\{([^}]+)\}/);
    expect(reducedBlock).toBeTruthy();
    expect(reducedBlock![1]).toContain("pointer-events: auto");
  });
});
