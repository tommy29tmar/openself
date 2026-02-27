import type { Section } from "@/lib/page-config/schema";

/** Section types that are always considered "complete" (structural). */
const EXEMPT_TYPES = new Set(["hero", "footer"]);

/**
 * Check if a section has enough content to be worth displaying.
 * Hero and footer are always complete (structural sections).
 */
export function isSectionComplete(section: Section): boolean {
  if (EXEMPT_TYPES.has(section.type)) return true;

  const content = section.content;
  if (!content || typeof content !== "object") return false;

  const c = content as Record<string, unknown>;

  // Sections with items arrays: must have at least 1 item
  if (Array.isArray(c.items) && c.items.length > 0) return true;
  if (Array.isArray(c.groups) && c.groups.length > 0) return true;
  if (Array.isArray(c.links) && c.links.length > 0) return true;
  if (Array.isArray(c.methods) && c.methods.length > 0) return true;

  // At a Glance: any of stats, skillGroups, or interests non-empty
  if (section.type === "at-a-glance") {
    if (Array.isArray(c.stats) && c.stats.length > 0) return true;
    if (Array.isArray(c.skillGroups) && c.skillGroups.length > 0) return true;
    if (Array.isArray(c.interests) && c.interests.length > 0) return true;
  }

  // Bio: must have non-empty text
  if (section.type === "bio" && typeof c.text === "string" && c.text.trim().length > 0) return true;

  // Custom: must have body or items
  if (section.type === "custom") {
    if (typeof c.body === "string" && c.body.trim().length > 0) return true;
    if (Array.isArray(c.items) && c.items.length > 0) return true;
  }

  return false;
}

/**
 * Filter sections to only include complete ones.
 * Hero and footer always pass.
 */
export function filterCompleteSections(sections: Section[]): Section[] {
  return sections.filter(isSectionComplete);
}
