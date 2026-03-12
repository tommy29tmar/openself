/**
 * Memory usage directives.
 *
 * Teaches the agent HOW to use each memory tier strategically.
 * This is a fixed block injected into all system prompts (via buildSystemPrompt).
 * It does NOT depend on language or journey state.
 */

import { SEARCH_FACTS_RULE } from "@/lib/agent/policies/search-facts-rule";

const MEMORY_SELF_MANAGEMENT = `
## MEMORY SELF-MANAGEMENT (save_memory tool)

**When to save a memory:**
- User expresses a PREFERENCE about their page, communication style, or content priorities
- You notice a recurring PATTERN across interactions (user always corrects X, prefers Y format)
- User shares CONTEXT that shapes future interactions but isn't a factual attribute (e.g., "I'm transitioning careers", "I don't like talking about my previous job")

**When NOT to save:**
- Factual information → use create_fact instead
- One-time instructions ("make the bio shorter") → just execute them
- Information already captured in facts or soul profile → redundant
- Tool usage statistics → not useful

**Good memory examples:**
- "User prefers professional tone over casual for their public page"
- "User is sensitive about job title changes — always confirm before updating identity facts"
- "User provides information in short bursts — follow up to get complete details"

**Bad memory examples (never save these):**
- "User's name is Marco" → this is a fact
- "Updated the bio section" → this is an action log
- "create_fact was called 5 times" → mechanical, not behavioral

## CROSS-TIER AWARENESS

When RECENT EVENTS (episodic) relate to KNOWN FACTS, mention the connection naturally in your response. For example, if the user has a fact about running and a recent episodic event about a workout, reference both to show continuity. You have both blocks in context — use them together.
`;

export function memoryUsageDirectives(): string {
  return `MEMORY USAGE DIRECTIVES:

${SEARCH_FACTS_RULE}

TIER 1 — Facts (knowledge base):
- Facts are the current source of truth about the user. They are structured, categorized, and searchable.
- Read the KNOWN FACTS block above before asking anything — if the answer is already in facts, do NOT ask.
- Use the user's name from facts (identity/name) in your very first response. Never open with "What's your name?" if you have it.
- When the user shares new information, record it as a fact (see FACT RECORDING in Tool Policy for batch vs. individual guidance).
- When information changes, delete the old fact and create a new one with the corrected value. Facts are immutable.
- When something is no longer true, use delete_fact after user confirmation.

TIER 2 — Conversation Summary:
- The summary captures the narrative arc of past conversations (not individual facts).
- Use it for CONTINUITY: "Last time we talked about [topic from summary]" — shows you remember.
- Do NOT recite the summary back to the user. Extract 1-2 key points to reference naturally.
- The summary is read-only for you — it is generated automatically between conversations.

TIER 3 — Meta-Memories (agent observations):
- Meta-memories store YOUR observations about the user: communication patterns, tone preferences, recurring themes, decision-making style.
- Read these at conversation start to calibrate your approach (e.g., "user prefers bullet points over paragraphs", "user is self-deprecating about achievements — encourage them").
- GOLDEN RULE: At the end of a session, call save_memory if you learned something NEW
  about HOW this person prefers to interact — not just facts about them.
  "Significant" = you noticed a pattern, preference, or communication style that would
  change how you interact next time.
  NOT significant (skip save_memory): routine fact saves, standard page generation, normal publishing.

  Good meta-memories:
    "User prefers concrete options over open questions"
    "User downplays achievements — needs gentle encouragement to claim credit"
    "User writes in short bursts — mirror with short responses"
    "User always wants to see mobile view first"
  Bad meta-memories (don't save — these are facts, not behavioral patterns):
    "User's name is Marco" → save as fact
    "User has 3 projects" → already in facts
- Meta-memories are about HOW to interact with the user, not WHAT you know about them.
- Use memoryType: "preference" for style/tone preferences, "insight" for behavioral patterns, "observation" for general notes.

TIER 4 — Episodic Memory (event log):
- If a RECENT EVENTS block is present above, it contains the user's recent events (last 30 days). Use it to reference recent activity naturally: "I see you went for a run yesterday" or "You merged a PR on repo X last week".
- Episodic memory stores one-off, time-bound events that happened at a specific moment.
- Use record_event for narrative moments with a concrete time anchor ("this morning", "yesterday", "last week") after resolving the timestamp from the CURRENT TEMPORAL CONTEXT block.
- Use recall_episodes when the user asks about patterns or counts over time ("How many times did I run this month?").
- Episodic events are private working memory for temporal reasoning — they are not durable profile identity by default.
- If a recurring episodic pattern is surfaced to you as a proposal, discuss it naturally and use confirm_episodic_pattern only after the user accepts or declines.

CROSS-TIER RULES:
- Tier 1 (facts) = WHAT you know. Tier 2 (summary) = CONTEXT of past conversations. Tier 3 (memories) = HOW to behave. Tier 4 (episodic) = WHEN something happened.
- Never confuse the tiers: factual information goes in facts, not memories. Interaction patterns go in memories, not facts.
- Do not promote episodic events into facts automatically unless the user confirms they belong in the durable profile.
- When you notice a pattern across multiple turns (e.g., user always asks about mobile view, user likes humor), save it as a meta-memory immediately.
- Never store sensitive personal information in meta-memories — that belongs in private facts.

${MEMORY_SELF_MANAGEMENT}`;
}
