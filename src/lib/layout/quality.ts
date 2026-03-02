export type SlotSize = "wide" | "half" | "third" | "square" | "micro";

export type LayoutIssueType =
  | "overflow_risk"
  | "too_sparse"
  | "incompatible_widget"
  | "missing_required"
  | "unplaceable_section";

export type IssueSeverity = "error" | "warning";

export type LayoutValidationIssue = {
  slotId: string;
  issue: LayoutIssueType;
  severity: IssueSeverity;
  message: string;
  suggestion?: string;
};

export type LayoutValidationResult = {
  ok: boolean;
  errors: LayoutValidationIssue[];
  warnings: LayoutValidationIssue[];
  all: LayoutValidationIssue[];
};

export type LayoutSlotDefinition = {
  id: string;
  size: SlotSize;
  required?: boolean;
  maxSections?: number;
};

export type LayoutTemplate = {
  id: string;
  slots: LayoutSlotDefinition[];
};

export type LayoutWidgetDefinition = {
  id: string;
  fitsIn: SlotSize[];
  minItems?: number;
  maxItems?: number;
};

export type SlotAssignment = {
  slotId: string;
  widgetId: string;
  itemCount?: number;
};

const SEVERITY_MAP: Record<LayoutIssueType, IssueSeverity> = {
  missing_required: "error",
  incompatible_widget: "error",
  overflow_risk: "warning",
  too_sparse: "warning",
  unplaceable_section: "warning",
};

function normalizeWidgets(
  widgets:
    | LayoutWidgetDefinition[]
    | Record<string, LayoutWidgetDefinition>,
): Record<string, LayoutWidgetDefinition> {
  if (!Array.isArray(widgets)) {
    return widgets;
  }

  const map: Record<string, LayoutWidgetDefinition> = {};
  for (const widget of widgets) {
    map[widget.id] = widget;
  }
  return map;
}

/**
 * Deterministic pre-render quality check for layout composition.
 *
 * It validates that:
 * - required slots are populated
 * - widget-to-slot size compatibility is respected
 * - item density is sane for each widget (min/max)
 * - slot capacity (max sections) is not exceeded
 */
export function validateLayoutComposition(
  template: LayoutTemplate,
  assignments: SlotAssignment[],
  widgets:
    | LayoutWidgetDefinition[]
    | Record<string, LayoutWidgetDefinition>,
): LayoutValidationResult {
  const all: LayoutValidationIssue[] = [];
  const widgetMap = normalizeWidgets(widgets);
  const templateSlots = new Map(template.slots.map((slot) => [slot.id, slot]));
  const assignmentsBySlot = new Map<string, SlotAssignment[]>();

  for (const assignment of assignments) {
    const slot = templateSlots.get(assignment.slotId);
    if (!slot) {
      all.push({
        slotId: assignment.slotId,
        issue: "incompatible_widget",
        severity: SEVERITY_MAP["incompatible_widget"],
        message: `Assignment references unknown slot '${assignment.slotId}'.`,
        suggestion:
          "Re-run slot assignment against the active template before rendering.",
      });
      continue;
    }

    const list = assignmentsBySlot.get(slot.id) ?? [];
    list.push(assignment);
    assignmentsBySlot.set(slot.id, list);
  }

  for (const slot of template.slots) {
    const slotAssignments = assignmentsBySlot.get(slot.id) ?? [];

    if (slot.required && slotAssignments.length === 0) {
      all.push({
        slotId: slot.id,
        issue: "missing_required",
        severity: SEVERITY_MAP["missing_required"],
        message: `Required slot '${slot.id}' is empty.`,
        suggestion: "Assign at least one compatible section/widget to this slot.",
      });
    }

    if (
      typeof slot.maxSections === "number" &&
      slotAssignments.length > slot.maxSections
    ) {
      all.push({
        slotId: slot.id,
        issue: "overflow_risk",
        severity: SEVERITY_MAP["overflow_risk"],
        message: `Slot '${slot.id}' has ${slotAssignments.length} sections, limit is ${slot.maxSections}.`,
        suggestion:
          "Move some sections to another slot or increase slot capacity in template definition.",
      });
    }

    for (const assignment of slotAssignments) {
      const widget = widgetMap[assignment.widgetId];
      if (!widget) {
        all.push({
          slotId: slot.id,
          issue: "incompatible_widget",
          severity: SEVERITY_MAP["incompatible_widget"],
          message: `Unknown widget '${assignment.widgetId}' for slot '${slot.id}'.`,
          suggestion:
            "Use a registered widget id and keep registry in sync with section variants.",
        });
        continue;
      }

      if (!widget.fitsIn.includes(slot.size)) {
        all.push({
          slotId: slot.id,
          issue: "incompatible_widget",
          severity: SEVERITY_MAP["incompatible_widget"],
          message: `Widget '${widget.id}' does not fit slot size '${slot.size}'.`,
          suggestion:
            "Pick a compact widget variant for this slot or move section to a larger slot.",
        });
      }

      const itemCount = assignment.itemCount ?? 0;
      if (
        typeof widget.maxItems === "number" &&
        itemCount > widget.maxItems
      ) {
        all.push({
          slotId: slot.id,
          issue: "overflow_risk",
          severity: SEVERITY_MAP["overflow_risk"],
          message: `Widget '${widget.id}' has ${itemCount} items, max is ${widget.maxItems}.`,
          suggestion:
            "Switch to a denser widget variant or trim content in this section.",
        });
      }

      if (
        typeof widget.minItems === "number" &&
        itemCount < widget.minItems
      ) {
        all.push({
          slotId: slot.id,
          issue: "too_sparse",
          severity: SEVERITY_MAP["too_sparse"],
          message: `Widget '${widget.id}' has ${itemCount} items, min is ${widget.minItems}.`,
          suggestion:
            "Use a simpler widget for sparse data or enrich section content.",
        });
      }
    }
  }

  const errors = all.filter((i) => i.severity === "error");
  const warnings = all.filter((i) => i.severity === "warning");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    all,
  };
}
