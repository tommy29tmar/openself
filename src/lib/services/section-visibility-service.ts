/**
 * Section visibility service.
 *
 * Manages which sections are hidden from the published page.
 * Hidden sections are stored as a JSON array of section type strings in
 * the `hidden_sections` column on the `page` table (draft row).
 *
 * In the builder preview, hidden sections are shown as ghost cards.
 * In the public page and publish pipeline, hidden sections are filtered out.
 */

import { eq, and, inArray } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import { page } from "@/lib/db/schema";

/**
 * Read the hidden sections list for a draft page.
 * Returns an empty array if no draft or no hidden sections.
 */
export function getHiddenSections(pageId: string): string[] {
  const row = db
    .select({ hiddenSections: page.hiddenSections })
    .from(page)
    .where(
      and(
        eq(page.id, pageId),
        inArray(page.status, ["draft", "approval_pending"]),
      ),
    )
    .get();

  if (!row?.hiddenSections) return [];

  try {
    const parsed = JSON.parse(row.hiddenSections as string);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Toggle visibility of a section type.
 * @param visible - true to show (remove from hidden list), false to hide (add to hidden list)
 * @returns The updated hidden sections list.
 */
export function toggleSectionVisibility(
  pageId: string,
  sectionType: string,
  visible: boolean,
): string[] {
  return sqlite.transaction(() => {
    const current = getHiddenSections(pageId);
    const isHidden = current.includes(sectionType);

    let updated: string[];
    if (visible && isHidden) {
      // Show: remove from hidden list
      updated = current.filter(s => s !== sectionType);
    } else if (!visible && !isHidden) {
      // Hide: add to hidden list
      updated = [...current, sectionType];
    } else {
      // Already in desired state
      updated = current;
    }

    const result = db.update(page)
      .set({ hiddenSections: JSON.stringify(updated) })
      .where(
        and(
          eq(page.id, pageId),
          inArray(page.status, ["draft", "approval_pending"]),
        ),
      )
      .run();

    if (result.changes === 0) {
      console.warn(`[section-visibility] toggleSectionVisibility: no draft found for pageId=${pageId}`);
    }

    return updated;
  })();
}
