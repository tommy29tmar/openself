/**
 * Canonical rule for when to call search_facts.
 *
 * This single source of truth is embedded into all policy blocks
 * that previously had contradictory or overly-eager instructions.
 */

export const SEARCH_FACTS_RULE = `WHEN TO CALL search_facts:
- To find a specific factId BEFORE calling update_fact or delete_fact
- When you need a specific fact that is NOT visible in the KNOWN FACTS block above
DO NOT call search_facts:
- Speculatively "just to check" before asking a question
- When the fact is already visible in the KNOWN FACTS block
- As a substitute for reading the context you already have
This avoids unnecessary round-trips that add latency.`;
