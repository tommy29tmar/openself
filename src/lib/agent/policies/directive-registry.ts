// src/lib/agent/policies/directive-registry.ts

import type { JourneyState, Situation } from "@/lib/agent/journey";
import type { SituationContext } from "@/lib/agent/policies";

// ── Type-safe context mapping ────────────────────────────────────────────────
// Each Situation maps to ONLY the SituationContext fields it is allowed to use.
// Accessing ctx.staleFacts inside a has_thin_sections build() is a compile error.
export type SituationContextMap = {
  has_pending_proposals: Pick<SituationContext, "pendingProposalCount" | "pendingProposalSections">;
  has_thin_sections:     Pick<SituationContext, "thinSections">;
  has_stale_facts:       Pick<SituationContext, "staleFacts">;
  has_open_conflicts:    Pick<SituationContext, "openConflicts">;
  has_archivable_facts:  Pick<SituationContext, "archivableFacts">;
  has_recent_import:     Pick<SituationContext, "importGapReport">;
  has_name:              Record<never, never>;
  has_soul:              Record<never, never>;
};

export type DirectiveEntry<S extends Situation> = {
  /** Lower number = higher priority. Wins on incompatibleWith conflicts. */
  priority: number;
  /** Deterministic tie-break when priority is equal. Use situation name string. */
  tieBreak: string;
  /** Whitelist of journey states where this directive may appear. Single source of truth. */
  eligibleStates: JourneyState[];
  /**
   * Other situations whose directives must not co-exist with this one.
   * MUST be symmetric: if A lists B, B must list A — enforced by validateDirectivePolicy().
   * If intentionally asymmetric, document why here.
   */
  incompatibleWith: Situation[];
  build: (ctx: SituationContextMap[S]) => string;
};

export type DirectivePolicy = {
  [S in Situation]: DirectiveEntry<S>;
};

export class DirectiveConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectiveConflictError";
  }
}

// Runtime validation: which context keys each situation requires.
// Used by getCtxFor() to validate before build().
export const SITUATION_REQUIRED_KEYS: { [S in Situation]: (keyof SituationContext)[] } = {
  has_pending_proposals: ["pendingProposalCount", "pendingProposalSections"],
  has_thin_sections:     ["thinSections"],
  has_stale_facts:       ["staleFacts"],
  has_open_conflicts:    ["openConflicts"],
  has_archivable_facts:  ["archivableFacts"],
  // importGapReport is NOT required — has_recent_import can be set from connector facts
  // even when route.ts hasn't yet resolved the gap report. Build returns "" when missing.
  has_recent_import:     [],
  has_name:              [],
  has_soul:              [],
};
