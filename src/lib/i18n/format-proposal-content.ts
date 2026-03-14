/**
 * Formats raw JSON content from conformity/curation proposals into
 * human-readable text. The content stored in proposals is typically
 * `JSON.stringify(record)` where record has field names as keys.
 *
 * This utility tries to extract meaningful text and present it cleanly.
 */

/** Fields to prioritize when extracting readable text (order matters). */
const PRIMARY_FIELDS = [
  "text",
  "name",
  "title",
  "tagline",
  "suggested",
  "current",
  "intro",
  "description",
  "institution",
  "field",
  "language",
  "proficiency",
  "frequency",
];

/**
 * Given a raw content string (typically JSON), return a clean human-readable
 * representation. Falls back to the raw string when parsing fails.
 */
export function formatProposalContent(raw: string): string {
  if (!raw) return "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not valid JSON -- return as-is (already human-readable text)
    return raw;
  }

  if (typeof parsed === "string") return parsed;
  if (Array.isArray(parsed)) return formatArray(parsed);
  if (parsed !== null && typeof parsed === "object") {
    return formatObject(parsed as Record<string, unknown>);
  }

  return raw;
}

function formatObject(obj: Record<string, unknown>): string {
  const parts: string[] = [];

  // First pass: extract primary fields in priority order
  const seen = new Set<string>();
  for (const key of PRIMARY_FIELDS) {
    if (key in obj && obj[key] != null) {
      const val = obj[key];
      if (typeof val === "string" && val.trim()) {
        parts.push(val.trim());
        seen.add(key);
      }
    }
  }

  // Handle "items" array (skills groups, experience items, etc.)
  if ("items" in obj && Array.isArray(obj.items)) {
    const itemTexts = formatArray(obj.items);
    if (itemTexts) parts.push(itemTexts);
    seen.add("items");
  }

  // Handle "groups" array (skills with grouped items)
  if ("groups" in obj && Array.isArray(obj.groups)) {
    for (const group of obj.groups) {
      if (group && typeof group === "object") {
        const g = group as Record<string, unknown>;
        const title = typeof g.title === "string" ? g.title : "";
        const items = Array.isArray(g.items) ? g.items.filter(Boolean).join(", ") : "";
        if (title && items) {
          parts.push(`${title}: ${items}`);
        } else if (title) {
          parts.push(title);
        } else if (items) {
          parts.push(items);
        }
      }
    }
    seen.add("groups");
  }

  // Second pass: pick up any remaining string fields (e.g., items_0_description)
  for (const [key, val] of Object.entries(obj)) {
    if (seen.has(key)) continue;
    if (typeof val === "string" && val.trim()) {
      // Skip internal/hash fields
      if (key.startsWith("_") || key.endsWith("Hash") || key === "id" || key === "ownerKey") continue;
      parts.push(val.trim());
      seen.add(key);
    }
  }

  if (parts.length === 0) {
    // Fallback: stringify compactly without braces
    return Object.entries(obj)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(", ");
  }

  // Join with line breaks for multi-field content, or just return single field
  return parts.join("\n");
}

function formatArray(arr: unknown[]): string {
  return arr
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return formatObject(item as Record<string, unknown>);
      }
      return String(item);
    })
    .filter(Boolean)
    .join("\n");
}
