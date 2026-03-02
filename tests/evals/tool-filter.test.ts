/**
 * Tests for journey-state tool filtering (Task 27).
 * Validates that tool sets are correctly restricted per journey state.
 */
import { describe, it, expect } from "vitest";
import { filterToolsByJourneyState, TOOL_SETS } from "@/lib/agent/tool-filter";

// SYNC: Must match tool names exported by createAgentTools in tools.ts.
// When adding a new tool, add it here AND review ONBOARDING_TOOLS in tool-filter.ts.
const ALL_TOOL_NAMES = [
  "create_fact", "update_fact", "delete_fact", "search_facts",
  "set_fact_visibility", "save_memory", "resolve_conflict",
  "generate_page", "update_page_style", "set_theme", "set_layout",
  "reorder_sections", "propose_lock", "request_publish", "propose_soul_change",
  "batch_facts", "archive_fact", "unarchive_fact", "reorder_items",
  "move_section", "publish_preflight", "inspect_page_state",
];

function mockTools(names: string[]): Record<string, unknown> {
  return Object.fromEntries(names.map(n => [n, { description: n }]));
}

describe("tool filtering by journey state", () => {
  it("first_visit: returns only onboarding tools (no style/publish/layout)", () => {
    const tools = mockTools(ALL_TOOL_NAMES);
    const filtered = filterToolsByJourneyState(tools, "first_visit");
    const names = Object.keys(filtered);
    expect(names).toContain("create_fact");
    expect(names).toContain("batch_facts");
    expect(names).toContain("generate_page");
    expect(names).toContain("save_memory");
    expect(names).not.toContain("set_theme");
    expect(names).not.toContain("set_layout");
    expect(names).not.toContain("request_publish");
    expect(names).not.toContain("propose_lock");
    expect(names).not.toContain("update_page_style");
    expect(names).not.toContain("move_section");
    expect(names).not.toContain("reorder_sections");
    expect(names).not.toContain("publish_preflight");
  });

  it("returning_no_page: same as first_visit", () => {
    const tools = mockTools(ALL_TOOL_NAMES);
    const first = filterToolsByJourneyState(tools, "first_visit");
    const returning = filterToolsByJourneyState(tools, "returning_no_page");
    expect(Object.keys(first).sort()).toEqual(Object.keys(returning).sort());
  });

  it("blocked: returns empty tools", () => {
    const tools = mockTools(ALL_TOOL_NAMES);
    const filtered = filterToolsByJourneyState(tools, "blocked");
    expect(Object.keys(filtered)).toHaveLength(0);
  });

  it("active_fresh: returns all tools", () => {
    const tools = mockTools(ALL_TOOL_NAMES);
    const filtered = filterToolsByJourneyState(tools, "active_fresh");
    expect(Object.keys(filtered).sort()).toEqual(ALL_TOOL_NAMES.sort());
  });

  it("draft_ready: returns all tools", () => {
    const tools = mockTools(ALL_TOOL_NAMES);
    const filtered = filterToolsByJourneyState(tools, "draft_ready");
    expect(Object.keys(filtered).sort()).toEqual(ALL_TOOL_NAMES.sort());
  });

  it("active_stale: returns all tools", () => {
    const tools = mockTools(ALL_TOOL_NAMES);
    const filtered = filterToolsByJourneyState(tools, "active_stale");
    expect(Object.keys(filtered).sort()).toEqual(ALL_TOOL_NAMES.sort());
  });

  it("unknown state falls back to all tools", () => {
    const tools = mockTools(ALL_TOOL_NAMES);
    const filtered = filterToolsByJourneyState(tools, "unknown_state" as any);
    expect(Object.keys(filtered).sort()).toEqual(ALL_TOOL_NAMES.sort());
  });

  it("filters gracefully when tool set references tools not in input", () => {
    const tools = mockTools(["create_fact", "save_memory"]);
    const filtered = filterToolsByJourneyState(tools, "first_visit");
    expect(Object.keys(filtered).sort()).toEqual(["create_fact", "save_memory"]);
  });

  it("TOOL_SETS exports are frozen subsets", () => {
    expect(TOOL_SETS.blocked).toEqual([]);
    expect(TOOL_SETS.first_visit).toBeDefined();
    expect(TOOL_SETS.first_visit!.length).toBeGreaterThan(5);
  });
});
