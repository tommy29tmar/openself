import type { PageConfig } from "./schema";

/**
 * Normalize a PageConfig before any write operation.
 * Ensures consistent hashing and removes redundant/conflicting fields.
 *
 * Called by: upsertDraft, update_page_config tool, prepareAndPublish.
 */
export function normalizeConfigForWrite(config: PageConfig): PageConfig {
  const normalized = { ...config };

  // 1. If layoutTemplate present, canonicalize legacy style.layout to "centered"
  //    (not removed — schema validator still validates it)
  if (normalized.layoutTemplate) {
    normalized.style = { ...normalized.style, layout: "centered" };
  }

  // 2. Clean up lockProposals that have been promoted to locks
  normalized.sections = normalized.sections.map((s) => {
    if (s.lock && s.lockProposal) {
      const { lockProposal: _, ...rest } = s;
      return rest;
    }
    return s;
  });

  // 3. Strip undefined layoutTemplate to avoid JSON noise
  if (!normalized.layoutTemplate) {
    delete normalized.layoutTemplate;
  }

  return normalized;
}
