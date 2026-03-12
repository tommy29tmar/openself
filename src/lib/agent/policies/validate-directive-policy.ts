// src/lib/agent/policies/validate-directive-policy.ts
import type { Situation } from "@/lib/agent/journey";
import { ALL_JOURNEY_STATES, type DirectivePolicy } from "@/lib/agent/policies/directive-registry";

const INTENTIONALLY_EMPTY_STATES: Situation[] = ["has_name", "has_soul"];

export function validateDirectivePolicy(policy: DirectivePolicy): void {
  for (const [situation, entry] of Object.entries(policy) as [Situation, DirectivePolicy[Situation]][]) {
    // 1. No self-conflict
    if (entry.incompatibleWith.includes(situation)) {
      throw new Error(`[DIRECTIVE_POLICY] Self-conflict: ${situation}`);
    }

    // 2. No empty eligibleStates (unless intentionally signal-only)
    if (entry.eligibleStates.length === 0 && !INTENTIONALLY_EMPTY_STATES.includes(situation)) {
      throw new Error(
        `[DIRECTIVE_POLICY] Empty eligibleStates for "${situation}". ` +
        `If intentional, add to INTENTIONALLY_EMPTY_STATES in validate-directive-policy.ts`
      );
    }

    // 3. Valid journeyState references
    for (const state of entry.eligibleStates) {
      if (!ALL_JOURNEY_STATES.includes(state)) {
        throw new Error(`[DIRECTIVE_POLICY] Unknown journeyState "${state}" in ${situation}.eligibleStates`);
      }
    }

    // 4. Symmetric incompatibleWith + no equal-priority pairs
    for (const other of entry.incompatibleWith) {
      const otherEntry = policy[other];
      if (!otherEntry) {
        throw new Error(`[DIRECTIVE_POLICY] Unknown situation "${other}" in ${situation}.incompatibleWith`);
      }
      if (!otherEntry.incompatibleWith.includes(situation)) {
        throw new Error(
          `[DIRECTIVE_POLICY] Asymmetric incompatibility: "${situation}" → "${other}" ` +
          `but "${other}" does not list "${situation}". Add it, or document why asymmetric.`
        );
      }
      // Equal-priority incompatible pairs are ambiguous — resolveIncompatibilities() will throw at runtime
      if (entry.priority === otherEntry.priority) {
        throw new Error(
          `[DIRECTIVE_POLICY] Equal-priority incompatible pair: "${situation}" (p=${entry.priority}) ` +
          `and "${other}" (p=${otherEntry.priority}). Assign different priorities or remove incompatibility.`
        );
      }
    }
  }
}
