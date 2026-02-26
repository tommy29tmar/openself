import type { Section, SectionLock, ComponentType } from "@/lib/page-config/schema";
import type { LayoutTemplateDefinition, FullSlotDefinition } from "./types";
import type { LayoutValidationIssue } from "./quality";
import { validateLayoutComposition } from "./quality";
import { getBestWidget, getCompatibleWidgets, buildWidgetMap } from "./widgets";
import { canMutateSection } from "./lock-policy";

type AssignOptions = {
  repair?: boolean; // default true — if false, skip auto-repair (used by publish gate)
};

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
): { sections: Section[]; issues: LayoutValidationIssue[] } {
  const doRepair = options?.repair !== false;
  const result: Section[] = [];

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
  const unassigned: Section[] = [];
  for (const section of sections) {
    const lock = locks?.get(section.id) ?? section.lock;
    if (lock?.position && section.slot) {
      const s = { ...section };
      consumeSlot(s.slot!);
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

    for (const slot of candidateSlots) {
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

    // Fallback: any slot with capacity
    if (!placed) {
      for (const slot of template.slots) {
        if (slot.id === template.heroSlot || slot.id === template.footerSlot) continue;
        if (hasCapacity(slot.id)) {
          const s = { ...section, slot: slot.id };
          const widget = getBestWidget(sectionType, slot.size);
          if (widget && !s.widgetId) s.widgetId = widget.id;
          consumeSlot(slot.id);
          result.push(s);
          placed = true;
          break;
        }
      }
    }

    // Last resort: append without slot assignment
    if (!placed) {
      result.push({ ...section });
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

  return { sections: result, issues };
}

function countItems(section: Section): number {
  const c = section.content;
  if (Array.isArray(c.items)) return c.items.length;
  if (Array.isArray(c.groups)) return c.groups.length;
  if (Array.isArray(c.links)) return c.links.length;
  return 1;
}
