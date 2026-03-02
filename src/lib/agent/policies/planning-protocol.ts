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
- Always search_facts first to understand current state
- Use batch_facts for multiple fact changes (not individual create_fact calls)
- One generate_page at the end, not after each change
- If a tool returns { blocked: true } or { success: false }, read the suggestion and adjust your plan

STRUCTURAL (layout/visual changes): Explain the visual impact, then act.
Rules:
- Call inspect_page_state before any layout or style change
- Explain what will change and why before executing
- Point to the preview after: "Check the preview to see the new layout."

Expertise modulation:
- novice: always verbalize your plan, even for SIMPLE
- familiar: verbalize COMPOUND and STRUCTURAL only
- expert: act silently, confirm after ("Done — closed old job, added new one.")

After completing a COMPOUND or STRUCTURAL operation:
- Use save_memory to record the strategy and outcome
- Example: "User asked to reorganize projects by date. Used batch_facts to reorder + archive 2 old projects. Outcome: cleaner projects section."
- This helps you learn which approaches work for this user.`;
}
