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
    const t = getLayoutTemplate("vertical");
    expect(t.id).toBe("vertical");
    expect(t.slots.length).toBeGreaterThan(0);
  });

  it("returns sidebar-left template", () => {
    const t = getLayoutTemplate("sidebar-left");
    expect(t.id).toBe("sidebar-left");
    expect(t.slots.some((s) => s.id === "sidebar")).toBe(true);
  });

  it("returns bento-standard template", () => {
    const t = getLayoutTemplate("bento-standard");
    expect(t.id).toBe("bento-standard");
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
    expect(t.id).toBe("vertical");
  });

  it("returns vertical even when style.layout is split", () => {
    const config = makeConfig({ style: { colorScheme: "light", primaryColor: "#000", fontFamily: "inter", layout: "split" } });
    const t = resolveLayoutTemplate(config);
    expect(t.id).toBe("vertical");
  });

  it("returns vertical even when style.layout is stack", () => {
    const config = makeConfig({ style: { colorScheme: "light", primaryColor: "#000", fontFamily: "inter", layout: "stack" } });
    const t = resolveLayoutTemplate(config);
    expect(t.id).toBe("vertical");
  });

  it("returns requested template when layoutTemplate is valid", () => {
    const config = makeConfig({ layoutTemplate: "bento-standard" });
    const t = resolveLayoutTemplate(config);
    expect(t.id).toBe("bento-standard");
  });

  it("returns vertical for unknown layoutTemplate", () => {
    const config = makeConfig();
    (config as Record<string, unknown>).layoutTemplate = "nonexistent";
    const t = resolveLayoutTemplate(config);
    expect(t.id).toBe("vertical");
  });

  it("no LEGACY_LAYOUT_MAP — style.layout never maps to a template", () => {
    // Ensure that style.layout values like "split" and "stack"
    // do NOT map to sidebar-left or any other template
    for (const layout of ["centered", "split", "stack"] as const) {
      const config = makeConfig({ style: { colorScheme: "light", primaryColor: "#000", fontFamily: "inter", layout } });
      const t = resolveLayoutTemplate(config);
      expect(t.id).toBe("vertical");
    }
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
