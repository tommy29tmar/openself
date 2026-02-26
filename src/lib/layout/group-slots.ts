import type { Section } from "@/lib/page-config/schema";
import type { LayoutTemplateDefinition } from "./types";

/**
 * Group sections into their respective slots based on:
 * 1. Type routing: hero → heroSlot, footer → footerSlot (always, regardless of slot field)
 * 2. Explicit slot field if valid
 * 3. Fallback: overflow sections go to first slot with capacity (typically "main")
 *
 * Empty slots are included as empty arrays so layout components know they exist.
 * Order within each slot preserves original sections array order.
 */
export function groupSectionsBySlot(
  sections: Section[],
  template: LayoutTemplateDefinition,
): Record<string, Section[]> {
  // Initialize all slots with empty arrays
  const result: Record<string, Section[]> = {};
  const slotCapacity = new Map<string, number>();

  for (const slot of template.slots) {
    result[slot.id] = [];
    slotCapacity.set(slot.id, slot.maxSections ?? Infinity);
  }

  // Valid slot IDs for this template
  const validSlotIds = new Set(template.slots.map((s) => s.id));

  for (const section of sections) {
    // Step 1: Type routing — hero and footer always go to their designated slots
    if (section.type === "hero") {
      const targetSlot = template.heroSlot;
      if (result[targetSlot] && (result[targetSlot].length < (slotCapacity.get(targetSlot) ?? Infinity))) {
        result[targetSlot].push(section);
        continue;
      }
    }
    if (section.type === "footer") {
      const targetSlot = template.footerSlot;
      if (result[targetSlot] && (result[targetSlot].length < (slotCapacity.get(targetSlot) ?? Infinity))) {
        result[targetSlot].push(section);
        continue;
      }
    }

    // Step 2: Explicit slot assignment
    if (section.slot && validSlotIds.has(section.slot)) {
      const capacity = slotCapacity.get(section.slot) ?? Infinity;
      if (result[section.slot].length < capacity) {
        result[section.slot].push(section);
        continue;
      }
      // Slot full — fall through to overflow
    }

    // Step 3: Overflow — find first slot with capacity > 1 that has room
    let placed = false;
    for (const slot of template.slots) {
      if (slot.id === template.heroSlot || slot.id === template.footerSlot) continue;
      const capacity = slot.maxSections ?? Infinity;
      if (capacity > 1 && result[slot.id].length < capacity) {
        // Check if slot accepts this section type
        if (slot.accepts.includes(section.type as never)) {
          result[slot.id].push(section);
          placed = true;
          break;
        }
      }
    }

    // Last resort: put in first non-hero/footer slot that has any room
    if (!placed) {
      for (const slot of template.slots) {
        if (slot.id === template.heroSlot || slot.id === template.footerSlot) continue;
        const capacity = slot.maxSections ?? Infinity;
        if (result[slot.id].length < capacity) {
          result[slot.id].push(section);
          placed = true;
          break;
        }
      }
    }

    // If still not placed (all slots full), append to last non-footer slot
    if (!placed) {
      const lastSlot = template.slots.filter((s) => s.id !== template.footerSlot).pop();
      if (lastSlot) {
        result[lastSlot.id].push(section);
      }
    }
  }

  return result;
}
