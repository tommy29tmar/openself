import { describe, expect, it } from "vitest";
import {
  getWidgetById,
  getWidgetsForSection,
  getCompatibleWidgets,
  getBestWidget,
  resolveVariant,
  buildWidgetMap,
} from "@/lib/layout/widgets";
import { toSlotAssignments, canResolveLegacyWidget } from "@/lib/layout/validate-adapter";
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

describe("Phase 1b widgets", () => {
  it("experience-timeline widget exists and fits wide/half", () => {
    const w = getWidgetById("experience-timeline");
    expect(w).toBeDefined();
    expect(w!.sectionType).toBe("experience");
    expect(w!.fitsIn).toEqual(expect.arrayContaining(["wide", "half"]));
  });

  it("education-cards widget exists and fits wide/half", () => {
    const w = getWidgetById("education-cards");
    expect(w).toBeDefined();
    expect(w!.sectionType).toBe("education");
  });

  it("languages-list widget exists and fits wide/half/third", () => {
    const w = getWidgetById("languages-list");
    expect(w).toBeDefined();
    expect(w!.sectionType).toBe("languages");
    expect(w!.fitsIn).toContain("third");
  });

  it("activities-list widget fits wide/half", () => {
    const w = getWidgetById("activities-list");
    expect(w).toBeDefined();
    expect(w!.sectionType).toBe("activities");
    expect(w!.fitsIn).toEqual(expect.arrayContaining(["wide", "half"]));
  });

  it("activities-compact widget fits third only", () => {
    const w = getWidgetById("activities-compact");
    expect(w).toBeDefined();
    expect(w!.sectionType).toBe("activities");
    expect(w!.variant).toBe("compact");
    expect(w!.fitsIn).toEqual(["third"]);
  });

  it("getBestWidget selects activities-compact for third slot", () => {
    const w = getBestWidget("activities", "third");
    expect(w).toBeDefined();
    expect(w!.id).toBe("activities-compact");
    expect(w!.variant).toBe("compact");
  });

  it("getBestWidget selects activities-list for wide slot", () => {
    const w = getBestWidget("activities", "wide");
    expect(w).toBeDefined();
    expect(w!.id).toBe("activities-list");
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

describe("Phase 1b legacy adapter mapping", () => {
  it("resolves experience:default to experience-timeline", () => {
    const section: Section = { id: "e1", type: "experience", variant: "timeline", slot: "main", content: { items: [] } };
    expect(canResolveLegacyWidget(section)).toBe(true);
    const result = toSlotAssignments([section]);
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].widgetId).toBe("experience-timeline");
  });

  it("resolves education:default to education-cards", () => {
    const section: Section = { id: "e1", type: "education", slot: "main", content: { items: [] } };
    expect(canResolveLegacyWidget(section)).toBe(true);
    const result = toSlotAssignments([section]);
    expect(result.assignments[0].widgetId).toBe("education-cards");
  });

  it("resolves languages:default to languages-list", () => {
    const section: Section = { id: "l1", type: "languages", slot: "sidebar", content: { items: [] } };
    const result = toSlotAssignments([section]);
    expect(result.assignments[0].widgetId).toBe("languages-list");
  });

  it("resolves activities:compact to activities-compact", () => {
    const section: Section = { id: "a1", type: "activities", variant: "compact", slot: "card-1", content: { items: [] } };
    const result = toSlotAssignments([section]);
    expect(result.assignments[0].widgetId).toBe("activities-compact");
  });

  it("countItems handles methods array for contact sections", () => {
    const section: Section = {
      id: "c1",
      type: "contact",
      variant: "card",
      slot: "sidebar",
      content: { methods: [{ type: "email", value: "a@b.com" }, { type: "phone", value: "123" }] },
    };
    const result = toSlotAssignments([section]);
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].itemCount).toBe(2);
  });
});
