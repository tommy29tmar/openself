/**
 * Planning Protocol — replaces actionAwarenessPolicy.
 *
 * Teaches the agent to classify requests before executing,
 * reducing wasted tool calls and improving user experience.
 *
 * This is a fixed block injected into all system prompts via buildSystemPrompt.
 * Expertise modulation (from getExpertiseCalibration) adjusts verbosity externally.
 */

export function planningProtocol(): string {
  return `PLANNING PROTOCOL:

Before acting, classify the user's request:

SIMPLE (1-2 tool calls): Act directly.
Examples: create a single fact, change theme, answer a question.

COMPOUND (3+ tool calls): State your plan in 1-2 sentences, then execute.
Rules:
- Use search_facts to find specific factIds when updating or deleting
- Use batch_facts for multiple fact changes (not individual create_fact calls)
- One generate_page at the end, not after each change
- If a tool returns { blocked: true } or { success: false }, read the suggestion and adjust your plan

STRUCTURAL (layout/visual changes): Explain the visual impact, then act.
Rules:
- Call inspect_page_state before any layout or style change
- Explain what will change and why before executing
- Point to the preview after: "Check the preview to see the new layout."

Expertise modulation:
- novice: verbalize your plan for COMPOUND and STRUCTURAL operations. For SIMPLE fact saves, save silently and move forward — no verbalization needed even for novice. Exception: always surface OUTPUT_CONTRACT errors (success:false, REQUIRES_CONFIRMATION, pageVisible:false, recomposeOk:false).
- familiar: verbalize COMPOUND and STRUCTURAL only
- expert: act silently, confirm after ("Done — closed old job, added new one.")

After completing a COMPOUND or STRUCTURAL operation:
- Use save_memory ONLY for novel strategies or user preferences, not for routine operations
- Skip save_memory if the approach is standard (e.g., "added a fact", "changed theme")
- Good: "User prefers projects ordered by date, not impact. Reorganized accordingly."
- Bad: "Created 3 facts about work experience." (routine, adds no learning)
- Limit: max 1 save_memory per conversation turn to prevent memory bloat.`;
}
