import { describe, it, expect } from "vitest";
import { shouldShowStickyNav, extractNavSections } from "@/components/page/StickyNav";

describe("StickyNav", () => {
  it("shows when sections.length >= 8", () => {
    const sections = Array.from({ length: 8 }, (_, i) => ({ id: String(i), type: "bio" }));
    expect(shouldShowStickyNav(sections as any)).toBe(true);
  });
  it("hides when sections.length < 8", () => {
    const sections = Array.from({ length: 7 }, (_, i) => ({ id: String(i), type: "bio" }));
    expect(shouldShowStickyNav(sections as any)).toBe(false);
  });
  it("excludes hero and footer from nav links", () => {
    const sections = [
      { id: "1", type: "hero" },
      { id: "2", type: "bio" },
      { id: "3", type: "footer" },
    ];
    const nav = extractNavSections(sections as any);
    expect(nav.map(s => s.type)).toEqual(["bio"]);
  });
});
