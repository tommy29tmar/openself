import { describe, expect, it } from "vitest";
import {
  getLayoutTemplate,
  resolveLayoutTemplate,
  getAllTemplates,
} from "@/lib/layout/registry";
import { LAYOUT_TEMPLATES } from "@/lib/layout/contracts";
import type { PageConfig } from "@/lib/page-config/schema";

function makeConfig(overrides: Partial<PageConfig> = {}): PageConfig {
  return {
    version: 1,
    username: "test",
    theme: "minimal",
    style: {
      colorScheme: "light",
      primaryColor: "#000",
      fontFamily: "inter",
      layout: "centered",
    },
    sections: [],
    ...overrides,
  };
}

describe("getLayoutTemplate", () => {
  it("returns vertical template", () => {
    const t = getLayoutTemplate("monolith");
    expect(t.id).toBe("monolith");
    expect(t.slots.length).toBeGreaterThan(0);
  });

  it("returns curator template", () => {
    const t = getLayoutTemplate("curator");
    expect(t.id).toBe("curator");
    expect(t.slots.some((s) => s.id === "sidebar")).toBe(true);
  });

  it("returns architect-standard template", () => {
    const t = getLayoutTemplate("architect");
    expect(t.id).toBe("architect");
    expect(t.slots.some((s) => s.id === "feature-left")).toBe(true);
  });

  it("all templates have hero and footer slots", () => {
    for (const id of LAYOUT_TEMPLATES) {
      const t = getLayoutTemplate(id);
      expect(t.heroSlot).toBeTruthy();
      expect(t.footerSlot).toBeTruthy();
      expect(t.slots.some((s) => s.id === t.heroSlot)).toBe(true);
      expect(t.slots.some((s) => s.id === t.footerSlot)).toBe(true);
    }
  });

  it("all slots have valid order and mobileOrder", () => {
    for (const id of LAYOUT_TEMPLATES) {
      const t = getLayoutTemplate(id);
      for (const slot of t.slots) {
        expect(typeof slot.order).toBe("number");
        expect(typeof slot.mobileOrder).toBe("number");
        expect(slot.accepts.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("resolveLayoutTemplate", () => {
  it("returns vertical for config without layoutTemplate", () => {
    const config = makeConfig();
    const t = resolveLayoutTemplate(config);
    expect(t.id).toBe("monolith");
  });

  it("returns vertical even when style.layout is split", () => {
    const config = makeConfig({ style: { colorScheme: "light", primaryColor: "#000", fontFamily: "inter", layout: "split" } });
    const t = resolveLayoutTemplate(config);
    expect(t.id).toBe("monolith");
  });

  it("returns vertical even when style.layout is stack", () => {
    const config = makeConfig({ style: { colorScheme: "light", primaryColor: "#000", fontFamily: "inter", layout: "stack" } });
    const t = resolveLayoutTemplate(config);
    expect(t.id).toBe("monolith");
  });

  it("returns requested template when layoutTemplate is valid", () => {
    const config = makeConfig({ layoutTemplate: "architect" });
    const t = resolveLayoutTemplate(config);
    expect(t.id).toBe("architect");
  });

  it("returns vertical for unknown layoutTemplate", () => {
    const config = makeConfig();
    (config as Record<string, unknown>).layoutTemplate = "nonexistent";
    const t = resolveLayoutTemplate(config);
    expect(t.id).toBe("monolith");
  });

  it("no LEGACY_LAYOUT_MAP — style.layout never maps to a template", () => {
    // Ensure that style.layout values like "split" and "stack"
    // do NOT map to curator-left or any other template
    for (const layout of ["centered", "split", "stack"] as const) {
      const config = makeConfig({ style: { colorScheme: "light", primaryColor: "#000", fontFamily: "inter", layout } });
      const t = resolveLayoutTemplate(config);
      expect(t.id).toBe("monolith");
    }
  });
});

describe("Phase 1b: new types accepted in layout slots", () => {
  it("vertical main slot accepts experience, education, languages, activities", () => {
    const t = getLayoutTemplate("monolith");
    const main = t.slots.find((s) => s.id === "main")!;
    expect(main.accepts).toContain("experience");
    expect(main.accepts).toContain("education");
    expect(main.accepts).toContain("languages");
    expect(main.accepts).toContain("activities");
  });

  it("curator-left main accepts experience, education, activities", () => {
    const t = getLayoutTemplate("curator");
    const main = t.slots.find((s) => s.id === "main")!;
    expect(main.accepts).toContain("experience");
    expect(main.accepts).toContain("education");
    expect(main.accepts).toContain("activities");
  });

  it("curator sidebar accepts languages, activities", () => {
    const t = getLayoutTemplate("curator");
    const curatorSlot = t.slots.find((s) => s.id === "sidebar")!;
    expect(curatorSlot.accepts).toContain("languages");
    expect(curatorSlot.accepts).toContain("activities");
  });

  it("architect-standard feature-left accepts experience, education", () => {
    const t = getLayoutTemplate("architect");
    const featureLeft = t.slots.find((s) => s.id === "feature-left")!;
    expect(featureLeft.accepts).toContain("experience");
    expect(featureLeft.accepts).toContain("education");
  });

  it("architect-standard full-row accepts experience, education, activities", () => {
    const t = getLayoutTemplate("architect");
    const fullRow = t.slots.find((s) => s.id === "full-row")!;
    expect(fullRow.accepts).toContain("experience");
    expect(fullRow.accepts).toContain("education");
    expect(fullRow.accepts).toContain("activities");
  });

  it("architect-standard card slots accept languages, activities", () => {
    const t = getLayoutTemplate("architect");
    for (const cardId of ["card-1", "card-2", "card-3"]) {
      const card = t.slots.find((s) => s.id === cardId)!;
      expect(card.accepts).toContain("languages");
      expect(card.accepts).toContain("activities");
    }
  });
});

describe("BUG-3: architect capacity", () => {
  it("architect full-row slot accepts 4+ sections for real-world pages", () => {
    const template = getLayoutTemplate("architect");
    const fullRow = template.slots.find((s) => s.id === "full-row");
    expect(fullRow).toBeDefined();
    expect(fullRow!.maxSections).toBeGreaterThanOrEqual(4);
  });
});

describe("getAllTemplates", () => {
  it("returns all registered templates", () => {
    const all = getAllTemplates();
    expect(all.length).toBe(LAYOUT_TEMPLATES.length);
    const ids = all.map((t) => t.id);
    for (const id of LAYOUT_TEMPLATES) {
      expect(ids).toContain(id);
    }
  });
});
