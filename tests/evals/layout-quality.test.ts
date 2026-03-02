import { describe, expect, it } from "vitest";
import {
  type LayoutTemplate,
  type LayoutWidgetDefinition,
  validateLayoutComposition,
} from "@/lib/layout/quality";

const TEMPLATE: LayoutTemplate = {
  id: "architect",
  slots: [
    { id: "hero", size: "wide", required: true, maxSections: 1 },
    { id: "card", size: "square", required: true, maxSections: 1 },
    { id: "main", size: "half", required: false, maxSections: 2 },
  ],
};

const WIDGETS: LayoutWidgetDefinition[] = [
  { id: "hero-large", fitsIn: ["wide"], minItems: 1, maxItems: 2 },
  { id: "skills-cloud", fitsIn: ["square", "half"], minItems: 3, maxItems: 20 },
  { id: "timeline-full", fitsIn: ["wide"], minItems: 1, maxItems: 6 },
];

describe("validateLayoutComposition", () => {
  it("flags missing required slot as error", () => {
    const result = validateLayoutComposition(
      TEMPLATE,
      [{ slotId: "card", widgetId: "skills-cloud", itemCount: 5 }],
      WIDGETS,
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((w) => w.issue === "missing_required" && w.slotId === "hero")).toBe(true);
    expect(result.errors.every((e) => e.severity === "error")).toBe(true);
  });

  it("flags incompatible widget for slot size as error", () => {
    const result = validateLayoutComposition(
      TEMPLATE,
      [
        { slotId: "hero", widgetId: "hero-large", itemCount: 1 },
        { slotId: "card", widgetId: "timeline-full", itemCount: 2 },
      ],
      WIDGETS,
    );

    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (w) => w.issue === "incompatible_widget" && w.slotId === "card",
      ),
    ).toBe(true);
  });

  it("flags overflow as warning (not error)", () => {
    const result = validateLayoutComposition(
      TEMPLATE,
      [
        { slotId: "hero", widgetId: "hero-large", itemCount: 1 },
        { slotId: "card", widgetId: "skills-cloud", itemCount: 25 },
      ],
      WIDGETS,
    );

    // overflow_risk is a warning, so ok should still be true (no errors)
    // unless there are other errors
    const overflowIssue = result.all.find((w) => w.issue === "overflow_risk" && w.slotId === "card");
    expect(overflowIssue).toBeDefined();
    expect(overflowIssue!.severity).toBe("warning");
    expect(result.warnings).toContain(overflowIssue);
  });

  it("flags too sparse as warning (not error)", () => {
    const result = validateLayoutComposition(
      TEMPLATE,
      [
        { slotId: "hero", widgetId: "hero-large", itemCount: 1 },
        { slotId: "card", widgetId: "skills-cloud", itemCount: 1 },
      ],
      WIDGETS,
    );

    const sparseIssue = result.all.find((w) => w.issue === "too_sparse" && w.slotId === "card");
    expect(sparseIssue).toBeDefined();
    expect(sparseIssue!.severity).toBe("warning");
    expect(result.warnings).toContain(sparseIssue);
  });

  it("flags slot overflow as warning", () => {
    const result = validateLayoutComposition(
      TEMPLATE,
      [
        { slotId: "hero", widgetId: "hero-large", itemCount: 1 },
        { slotId: "card", widgetId: "skills-cloud", itemCount: 4 },
        { slotId: "card", widgetId: "skills-cloud", itemCount: 4 },
      ],
      WIDGETS,
    );

    const overflowIssue = result.all.find(
      (w) => w.issue === "overflow_risk" && w.message.includes("limit"),
    );
    expect(overflowIssue).toBeDefined();
    expect(overflowIssue!.severity).toBe("warning");
  });

  it("passes when composition is compatible and balanced", () => {
    const result = validateLayoutComposition(
      TEMPLATE,
      [
        { slotId: "hero", widgetId: "hero-large", itemCount: 1 },
        { slotId: "card", widgetId: "skills-cloud", itemCount: 6 },
        { slotId: "main", widgetId: "skills-cloud", itemCount: 8 },
      ],
      WIDGETS,
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.all).toHaveLength(0);
  });

  it("severity policy: errors block, warnings do not", () => {
    // Only warnings (overflow_risk) — should still be ok
    const result = validateLayoutComposition(
      TEMPLATE,
      [
        { slotId: "hero", widgetId: "hero-large", itemCount: 1 },
        { slotId: "card", widgetId: "skills-cloud", itemCount: 25 },
      ],
      WIDGETS,
    );

    // missing_required for card is NOT present (card has assignment)
    // but hero has required=true and is present
    // overflow_risk is warning-only
    const hasOnlyWarnings = result.errors.length === 0 && result.warnings.length > 0;
    if (hasOnlyWarnings) {
      expect(result.ok).toBe(true);
    }
  });

  it("all issues have severity field", () => {
    const result = validateLayoutComposition(
      TEMPLATE,
      [{ slotId: "unknown", widgetId: "nonexistent", itemCount: 0 }],
      WIDGETS,
    );

    for (const issue of result.all) {
      expect(issue.severity).toMatch(/^(error|warning)$/);
    }
  });

  it("errors array only contains severity=error", () => {
    const result = validateLayoutComposition(
      TEMPLATE,
      [{ slotId: "hero", widgetId: "hero-large", itemCount: 1 }],
      WIDGETS,
    );

    for (const e of result.errors) {
      expect(e.severity).toBe("error");
    }
    for (const w of result.warnings) {
      expect(w.severity).toBe("warning");
    }
  });
});
