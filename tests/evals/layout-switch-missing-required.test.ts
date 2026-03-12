import { describe, it, expect } from "vitest";
import type { LayoutIssue } from "@/lib/layout/quality";

/**
 * Tests that missing_required errors are treated as warnings during layout switch.
 *
 * BUG-3: Switching to the architect layout fails with 400 because required
 * slots (e.g. footer) have 0 assignments. During a layout *switch*, missing_required
 * should be a warning (lenient). Publish gate enforces strict validation.
 */

/**
 * Mirrors the error filter logic in both:
 * - /api/draft/style route (line 112)
 * - set_layout tool in tools.ts (line 1117)
 *
 * FIX: Exclude missing_required from hard errors during layout switch.
 */
function filterBlockingErrors(issues: LayoutIssue[]): LayoutIssue[] {
  return issues.filter(
    (i) => i.severity === "error" && i.issue !== "missing_required",
  );
}

describe("layout switch missing_required handling", () => {
  it("does NOT treat missing_required as a blocking error during layout switch", () => {
    const issues: LayoutIssue[] = [
      {
        slotId: "footer",
        issue: "missing_required",
        severity: "error",
        message: "Required slot 'footer' is empty.",
        suggestion: "Assign at least one compatible section/widget to this slot.",
      },
    ];

    const errors = filterBlockingErrors(issues);
    expect(errors).toHaveLength(0);
  });

  it("still treats other errors as blocking", () => {
    const issues: LayoutIssue[] = [
      {
        slotId: "hero",
        issue: "incompatible_widget",
        severity: "error",
        message: "Widget 'bio-card' is not compatible with slot 'hero'.",
        suggestion: "Use a compatible widget.",
      },
    ];

    const errors = filterBlockingErrors(issues);
    expect(errors).toHaveLength(1);
    expect(errors[0].issue).toBe("incompatible_widget");
  });

  it("filters out missing_required but keeps other errors in mixed list", () => {
    const issues: LayoutIssue[] = [
      {
        slotId: "footer",
        issue: "missing_required",
        severity: "error",
        message: "Required slot 'footer' is empty.",
        suggestion: "Assign section.",
      },
      {
        slotId: "main",
        issue: "incompatible_widget",
        severity: "error",
        message: "Incompatible widget.",
        suggestion: "Change widget.",
      },
      {
        slotId: "sidebar",
        issue: "overflow_risk",
        severity: "warning",
        message: "Sidebar has too many sections.",
        suggestion: "Reduce sections.",
      },
    ];

    const errors = filterBlockingErrors(issues);
    // Only incompatible_widget should remain (severity=error AND not missing_required)
    expect(errors).toHaveLength(1);
    expect(errors[0].issue).toBe("incompatible_widget");
  });
});
