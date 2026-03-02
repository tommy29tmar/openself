import type { JourneyState } from "@/lib/agent/journey";

/**
 * Static tool availability per journey state.
 * States not listed here → all tools available (permissive default).
 *
 * Three tiers:
 * - BLOCKED → no tools (quota exhausted, agent can only talk)
 * - ONBOARDING (first_visit, returning_no_page) → fact + generate tools only
 * - FULL (draft_ready, active_fresh, active_stale) → all tools
 */
const ONBOARDING_TOOLS = [
  "create_fact",
  "update_fact",
  "delete_fact",
  "search_facts",
  "batch_facts",
  "archive_fact",
  "unarchive_fact",
  "reorder_items",
  "save_memory",
  "resolve_conflict",
  "generate_page",
  "propose_soul_change",
  "set_fact_visibility",
  "inspect_page_state",
] as const;

export const TOOL_SETS: Partial<Record<JourneyState, readonly string[]>> = {
  first_visit: ONBOARDING_TOOLS,
  returning_no_page: ONBOARDING_TOOLS,
  blocked: [],
  // draft_ready, active_fresh, active_stale → not listed = all tools
};

/**
 * Filter tools record by journey state. Returns a new object with only
 * the allowed tools. Unknown states → all tools (safe fallback).
 */
export function filterToolsByJourneyState<T>(
  tools: Record<string, T>,
  journeyState: string,
): Record<string, T> {
  const allowed = TOOL_SETS[journeyState as JourneyState];
  if (allowed === undefined) return tools; // permissive default
  if (allowed.length === 0) return {};     // blocked

  const allowedSet = new Set<string>(allowed);
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => allowedSet.has(name)),
  );
}
