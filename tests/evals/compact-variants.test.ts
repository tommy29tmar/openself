import { describe, expect, it } from "vitest";
import { getBestWidget } from "@/lib/layout/widgets";
import { assignSlotsFromFacts } from "@/lib/layout/assign-slots";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { Section } from "@/lib/page-config/schema";

function makeSection(overrides: Partial<Section> & { id: string; type: string }): Section {
  return { content: {}, ...overrides } as Section;
}

describe("compact variant widget resolution", () => {
  const types = ["reading", "education", "achievements", "music"] as const;

  for (const type of types) {
    it(`${type}-compact selected for third slot`, () => {
      const w = getBestWidget(type, "third");
      expect(w).toBeDefined();
      expect(w!.id).toBe(`${type}-compact`);
      expect(w!.variant).toBe("compact");
      expect(w!.fitsIn).toContain("third");
    });

    it(`${type} full variant still selected for wide slot`, () => {
      const w = getBestWidget(type, "wide");
      expect(w).toBeDefined();
      expect(w!.variant).not.toBe("compact");
    });
  }

  it("compact widgets have maxItems defined", () => {
    for (const type of types) {
      const w = getBestWidget(type, "third");
      expect(w!.maxItems).toBeGreaterThan(0);
    }
  });

  it("compact maxItems boundaries are sane", () => {
    // reading and music: 5 items max
    expect(getBestWidget("reading", "third")!.maxItems).toBe(5);
    expect(getBestWidget("music", "third")!.maxItems).toBe(5);
    // education and achievements: 3 items max
    expect(getBestWidget("education", "third")!.maxItems).toBe(3);
    expect(getBestWidget("achievements", "third")!.maxItems).toBe(3);
  });
});

describe("compact widgets in architect slot assignment", () => {
  const architect = getLayoutTemplate("architect");

  it("reading section lands in card-3 with reading-compact widget", () => {
    // With only reading as non-hero/footer, affinity ranking puts it in card-3
    // (card-3 reading affinity: 70 > full-row reading affinity: 60)
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "r1", type: "reading", content: { items: [{ title: "Book 1" }] } }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(architect, sections);
    const reading = result.find(s => s.id === "r1");
    expect(reading).toBeDefined();
    expect(reading!.slot).toBe("card-3");
    expect(reading!.widgetId).toBe("reading-compact");
  });

  it("music section lands in card-3 with music-compact widget", () => {
    // With only music as non-hero/footer, affinity ranking puts it in card-3
    // (card-3 music affinity: 70 > full-row music affinity: 60)
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "m1", type: "music", content: { items: [{ title: "Song 1", artist: "A" }] } }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(architect, sections);
    const music = result.find(s => s.id === "m1");
    expect(music).toBeDefined();
    expect(music!.slot).toBe("card-3");
    expect(music!.widgetId).toBe("music-compact");
  });

  it("overflow_risk emitted when items exceed compact maxItems", () => {
    const manyBooks = Array.from({ length: 8 }, (_, i) => ({ title: `Book ${i}` }));
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "r1", type: "reading", content: { items: manyBooks } }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result, issues } = assignSlotsFromFacts(architect, sections);
    const reading = result.find(s => s.id === "r1");
    // reading lands in card-3 (third-sized) → reading-compact (maxItems=5), 8 items → overflow_risk
    expect(reading!.slot).toBe("card-3");
    expect(reading!.widgetId).toBe("reading-compact");
    const overflow = issues.find(i => i.issue === "overflow_risk" && i.message.includes("reading-compact"));
    expect(overflow).toBeDefined();
  });
});
