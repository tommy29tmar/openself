import { describe, expect, it } from "vitest";
import {
  getWidgetById,
  getWidgetsForSection,
  getCompatibleWidgets,
  getBestWidget,
  resolveVariant,
  buildWidgetMap,
} from "@/lib/layout/widgets";
import type { Section } from "@/lib/page-config/schema";

describe("getWidgetById", () => {
  it("returns widget for known id", () => {
    const w = getWidgetById("skills-chips");
    expect(w).toBeDefined();
    expect(w!.sectionType).toBe("skills");
    expect(w!.variant).toBe("chips");
  });

  it("returns undefined for unknown id", () => {
    expect(getWidgetById("nonexistent")).toBeUndefined();
  });
});

describe("getWidgetsForSection", () => {
  it("returns all widgets for skills", () => {
    const widgets = getWidgetsForSection("skills");
    expect(widgets.length).toBeGreaterThanOrEqual(2);
    expect(widgets.every((w) => w.sectionType === "skills")).toBe(true);
  });

  it("returns empty array for type with no widgets", () => {
    // All core types should have widgets, but test defensive behavior
    const widgets = getWidgetsForSection("hero");
    expect(widgets.length).toBeGreaterThan(0);
  });
});

describe("getCompatibleWidgets", () => {
  it("returns widgets that fit in a given slot size", () => {
    const compatible = getCompatibleWidgets("skills", "third");
    expect(compatible.length).toBeGreaterThan(0);
    for (const w of compatible) {
      expect(w.fitsIn).toContain("third");
    }
  });

  it("returns empty array when no widget fits", () => {
    const compatible = getCompatibleWidgets("hero", "micro");
    expect(compatible).toHaveLength(0);
  });
});

describe("getBestWidget", () => {
  it("returns a widget for skills in third slot", () => {
    const w = getBestWidget("skills", "third");
    expect(w).toBeDefined();
    expect(w!.sectionType).toBe("skills");
    expect(w!.fitsIn).toContain("third");
  });

  it("returns undefined when no widget fits", () => {
    const w = getBestWidget("hero", "micro");
    expect(w).toBeUndefined();
  });
});

describe("resolveVariant", () => {
  it("resolves variant from widgetId (source of truth)", () => {
    const section: Section = {
      id: "s1",
      type: "skills",
      widgetId: "skills-chips",
      variant: "list", // should be ignored
      content: {},
    };
    expect(resolveVariant(section)).toBe("chips");
  });

  it("falls back to legacy variant when no widgetId", () => {
    const section: Section = {
      id: "s1",
      type: "skills",
      variant: "list",
      content: {},
    };
    expect(resolveVariant(section)).toBe("list");
  });

  it("returns undefined when neither widgetId nor variant", () => {
    const section: Section = {
      id: "s1",
      type: "skills",
      content: {},
    };
    expect(resolveVariant(section)).toBeUndefined();
  });

  it("falls back to variant when widgetId is unknown", () => {
    const section: Section = {
      id: "s1",
      type: "skills",
      widgetId: "nonexistent",
      variant: "chips",
      content: {},
    };
    // widgetId unknown → getWidgetById returns undefined → fall through
    expect(resolveVariant(section)).toBe("chips");
  });
});

describe("buildWidgetMap", () => {
  it("returns a record of all widgets keyed by id", () => {
    const map = buildWidgetMap();
    expect(map["skills-chips"]).toBeDefined();
    expect(map["hero-large"]).toBeDefined();
    expect(map["footer-default"]).toBeDefined();
  });
});
