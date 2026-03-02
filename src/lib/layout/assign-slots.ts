import type { Section, SectionLock, ComponentType } from "@/lib/page-config/schema";
import type { LayoutTemplateDefinition, FullSlotDefinition } from "./types";
import type { LayoutValidationIssue, LayoutIssueType } from "./quality";
import { validateLayoutComposition } from "./quality";
import { getBestWidget, getCompatibleWidgets, buildWidgetMap } from "./widgets";
import { canMutateSection } from "./lock-policy";

type AssignOptions = {
  repair?: boolean; // default true — if false, skip auto-repair (used by publish gate)
};

/** Check slot exists, accepts the section type, and has remaining capacity */
function isSoftPinValid(
  slotId: string,
  sectionType: string,
  usedCapacity: Map<string, number>,
  slotCapacity: Map<string, number>,
  slotDefs: Map<string, FullSlotDefinition>,
): boolean {
  const slot = slotDefs.get(slotId);
  if (!slot) return false;
  if (!slot.accepts.includes(sectionType as ComponentType)) return false;
  const used = usedCapacity.get(slotId) ?? 0;
  const cap = slotCapacity.get(slotId) ?? 0;
  if (used >= cap) return false;
  return true;
}

/**
 * Assign sections to slots in the given template, respecting locks and type constraints.
 *
 * Auto-repair (when repair !== false):
 * - overflow_risk → try alternative widget, then try larger slot. NEVER truncate content.
 * - too_sparse → try more compact widget
 */
export function assignSlotsFromFacts(
  template: LayoutTemplateDefinition,
  sections: Section[],
  locks?: Map<string, SectionLock>,
  options?: AssignOptions,
  draftSlots?: Map<string, string>,
): { sections: Section[]; issues: LayoutValidationIssue[] } {
  const doRepair = options?.repair !== false;
  const result: Section[] = [];
  const unplaceableIssues: LayoutValidationIssue[] = [];

  // Build slot capacity tracker
  const slotCapacity = new Map<string, number>();
  const slotDefs = new Map<string, FullSlotDefinition>();
  for (const slot of template.slots) {
    slotCapacity.set(slot.id, slot.maxSections ?? Infinity);
    slotDefs.set(slot.id, slot);
  }

  const usedCapacity = new Map<string, number>();

  function consumeSlot(slotId: string): boolean {
    const cap = slotCapacity.get(slotId) ?? 0;
    const used = usedCapacity.get(slotId) ?? 0;
    if (used >= cap) return false;
    usedCapacity.set(slotId, used + 1);
    return true;
  }

  function hasCapacity(slotId: string): boolean {
    const cap = slotCapacity.get(slotId) ?? 0;
    const used = usedCapacity.get(slotId) ?? 0;
    return used < cap;
  }

  // Phase 1: locked sections keep their slot and widget
  // Phase 1.5: soft-pin — sections carry over their draft slot if valid
  const unassigned: Section[] = [];
  for (const section of sections) {
    const lock = locks?.get(section.id) ?? section.lock;
    if (lock?.position && section.slot) {
      const s = { ...section };
      consumeSlot(s.slot!);
      result.push(s);
      continue;
    }
    // Soft-pin: if this section had a slot in the previous draft, try to keep it
    const draftSlot = draftSlots?.get(section.id);
    if (draftSlot && isSoftPinValid(draftSlot, section.type, usedCapacity, slotCapacity, slotDefs)) {
      const s = { ...section, slot: draftSlot };
      const slotDef = slotDefs.get(draftSlot);
      if (slotDef) {
        const widget = getBestWidget(section.type as ComponentType, slotDef.size);
        if (widget && !s.widgetId) s.widgetId = widget.id;
      }
      consumeSlot(draftSlot);
      result.push(s);
      continue;
    }
    unassigned.push(section);
  }

  // Phase 2: hero/footer always go to designated slots
  // Footer is deferred to the end to preserve array order (footer last)
  const remaining: Section[] = [];
  let footerSection: Section | null = null;
  for (const section of unassigned) {
    if (section.type === "hero") {
      const s = { ...section, slot: template.heroSlot };
      const slotDef = slotDefs.get(template.heroSlot);
      if (slotDef) {
        const widget = getBestWidget("hero", slotDef.size);
        if (widget && !s.widgetId) s.widgetId = widget.id;
      }
      consumeSlot(template.heroSlot);
      result.push(s);
      continue;
    }
    if (section.type === "footer") {
      const s = { ...section, slot: template.footerSlot };
      const slotDef = slotDefs.get(template.footerSlot);
      if (slotDef) {
        const widget = getBestWidget("footer", slotDef.size);
        if (widget && !s.widgetId) s.widgetId = widget.id;
      }
      consumeSlot(template.footerSlot);
      footerSection = s;
      continue;
    }
    remaining.push(section);
  }

  // Phase 3: assign remaining sections to best available slot
  for (const section of remaining) {
    // Check lock for position mutation
    const lock = locks?.get(section.id) ?? section.lock;
    const positionLocked = lock?.position && canMutateSection(
      { ...section, lock } as Section,
      "position",
      "composer",
    ).allowed === false;

    if (positionLocked && section.slot) {
      // Position locked — keep current slot
      const s = { ...section };
      consumeSlot(s.slot!);
      result.push(s);
      continue;
    }

    const sectionType = section.type as ComponentType;
    let placed = false;

    // Try to find the best slot for this section type
    const candidateSlots = template.slots.filter(
      (slot) =>
        slot.id !== template.heroSlot &&
        slot.id !== template.footerSlot &&
        slot.accepts.includes(sectionType) &&
        hasCapacity(slot.id),
    );

    // Rank candidates: affinity DESC → fillRatio ASC → order ASC
    const ranked = [...candidateSlots].sort((a, b) => {
      const affinityA = a.affinity?.[sectionType] ?? 0;
      const affinityB = b.affinity?.[sectionType] ?? 0;
      if (affinityB !== affinityA) return affinityB - affinityA;

      const maxA = a.maxSections ?? Infinity;
      const maxB = b.maxSections ?? Infinity;
      const ratioA = maxA === Infinity ? 0 : (usedCapacity.get(a.id) ?? 0) / maxA;
      const ratioB = maxB === Infinity ? 0 : (usedCapacity.get(b.id) ?? 0) / maxB;
      if (ratioA !== ratioB) return ratioA - ratioB;

      return a.order - b.order;
    });

    for (const slot of ranked) {
      const widget = getBestWidget(sectionType, slot.size);
      if (widget) {
        const s = { ...section, slot: slot.id };
        if (!s.widgetId) s.widgetId = widget.id;
        consumeSlot(slot.id);
        result.push(s);
        placed = true;
        break;
      }
    }

    // No compatible slot found — section is unplaceable
    if (!placed) {
      result.push({ ...section });
      unplaceableIssues.push({
        slotId: "",
        issue: "unplaceable_section" as LayoutIssueType,
        severity: "warning",
        message: `Section '${section.id}' (type '${section.type}') has no compatible slot in template '${template.id}'.`,
        suggestion: "Add this section type to a slot's accepts list, or remove the section.",
      });
    }
  }

  // Append footer last to preserve expected array order
  if (footerSection) {
    result.push(footerSection);
  }

  // Validate the result
  const widgetMap = buildWidgetMap();
  const assignments = result
    .filter((s) => s.slot && s.widgetId)
    .map((s) => ({
      slotId: s.slot!,
      widgetId: s.widgetId!,
      itemCount: countItems(s),
    }));

  const validation = validateLayoutComposition(template, assignments, widgetMap);
  let issues = validation.all;

  // Auto-repair (only if enabled)
  if (doRepair && issues.length > 0) {
    for (const issue of [...issues]) {
      if (issue.issue === "overflow_risk" && issue.severity === "warning") {
        // Try switching to a widget that handles more items
        const affectedSections = result.filter((s) => s.slot === issue.slotId);
        for (const s of affectedSections) {
          const slotDef = slotDefs.get(s.slot!);
          if (!slotDef) continue;
          const sType = s.type as ComponentType;
          const alternatives = getCompatibleWidgets(sType, slotDef.size);
          const current = s.widgetId;
          const better = alternatives.find(
            (w) =>
              w.id !== current &&
              (w.maxItems === undefined || w.maxItems > (countItems(s) ?? 0)),
          );
          if (better) {
            s.widgetId = better.id;
          }
        }
      }
      if (issue.issue === "too_sparse" && issue.severity === "warning") {
        // Try switching to a more compact widget
        const affectedSections = result.filter((s) => s.slot === issue.slotId);
        for (const s of affectedSections) {
          const slotDef = slotDefs.get(s.slot!);
          if (!slotDef) continue;
          const sType = s.type as ComponentType;
          const alternatives = getCompatibleWidgets(sType, slotDef.size);
          const current = s.widgetId;
          const better = alternatives.find(
            (w) =>
              w.id !== current &&
              (w.minItems === undefined || w.minItems <= (countItems(s) ?? 0)),
          );
          if (better) {
            s.widgetId = better.id;
          }
        }
      }
    }

    // Re-validate after repair
    const repairAssignments = result
      .filter((s) => s.slot && s.widgetId)
      .map((s) => ({
        slotId: s.slot!,
        widgetId: s.widgetId!,
        itemCount: countItems(s),
      }));
    const repairValidation = validateLayoutComposition(template, repairAssignments, widgetMap);
    issues = repairValidation.all;
  }

  issues = [...unplaceableIssues, ...issues];

  return { sections: result, issues };
}

function countItems(section: Section): number {
  const c = section.content;
  if (Array.isArray(c.items)) return c.items.length;
  if (Array.isArray(c.groups)) return c.groups.length;
  if (Array.isArray(c.links)) return c.links.length;
  return 1;
}
