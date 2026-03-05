// src/lib/agent/policies/directive-registry.ts

import type { JourneyState, Situation } from "@/lib/agent/journey";
import type { SituationContext } from "@/lib/agent/policies";
import {
  pendingProposalsDirective,
  thinSectionsDirective,
  staleFactsDirective,
  openConflictsDirective,
  archivableFactsDirective,
  recentImportDirective,
  pendingSoulProposalsDirective,
} from "@/lib/agent/policies/situations";
import { logEvent } from "@/lib/services/event-service";

// ── Type-safe context mapping ────────────────────────────────────────────────
// Each Situation maps to ONLY the SituationContext fields it is allowed to use.
// Accessing ctx.staleFacts inside a has_thin_sections build() is a compile error.
export type SituationContextMap = {
  has_pending_proposals:       Pick<SituationContext, "pendingProposalCount" | "pendingProposalSections">;
  has_thin_sections:           Pick<SituationContext, "thinSections">;
  has_stale_facts:             Pick<SituationContext, "staleFacts">;
  has_open_conflicts:          Pick<SituationContext, "openConflicts">;
  has_archivable_facts:        Pick<SituationContext, "archivableFacts">;
  has_recent_import:           Pick<SituationContext, "importGapReport">;
  has_name:                    Record<never, never>;
  has_soul:                    Record<never, never>;
  has_pending_soul_proposals:  Pick<SituationContext, "pendingSoulProposals">;
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
  has_pending_proposals:      ["pendingProposalCount", "pendingProposalSections"],
  has_thin_sections:          ["thinSections"],
  has_stale_facts:            ["staleFacts"],
  has_open_conflicts:         ["openConflicts"],
  has_archivable_facts:       ["archivableFacts"],
  // importGapReport is NOT required — has_recent_import can be set from connector facts
  // even when route.ts hasn't yet resolved the gap report. Build returns "" when missing.
  has_recent_import:          [],
  has_name:                   [],
  has_soul:                   [],
  // pendingSoulProposals is optional — build returns "" when empty.
  has_pending_soul_proposals: [],
};

// ── getCtxFor ─────────────────────────────────────────────────────────────────
// Type-safe context accessor. Validates required keys before returning the
// narrowed context slice for a given situation.
// - In dev/test: throws on missing required field (fail fast, catch bugs early)
// - In production: logs + returns null (graceful degradation)
export function getCtxFor<S extends Situation>(
  situation: S,
  context: SituationContext,
): SituationContextMap[S] | null {
  for (const key of SITUATION_REQUIRED_KEYS[situation]) {
    if (context[key] === undefined || context[key] === null) {
      const msg = `[directive-registry] Missing context field "${key}" for situation "${situation}"`;
      if (process.env.NODE_ENV !== "production") throw new Error(msg);
      logEvent({ eventType: "directive_context_missing_field", actor: "system", payload: { situation, field: key } });
      return null;
    }
  }
  return context as unknown as SituationContextMap[S];
}

// ── ALL_JOURNEY_STATES ────────────────────────────────────────────────────────
// Used by validateDirectivePolicy() and tests.
export const ALL_JOURNEY_STATES: JourneyState[] = [
  "first_visit", "returning_no_page", "draft_ready",
  "active_fresh", "active_stale", "blocked",
];

// ── DIRECTIVE_POLICY ──────────────────────────────────────────────────────────
// The canonical policy matrix. One entry per Situation.
// priority: lower = higher priority (wins when incompatibleWith conflict arises)
// eligibleStates: whitelist of journey states where directive may appear
// incompatibleWith: MUST be symmetric — enforced by validateDirectivePolicy()
export const DIRECTIVE_POLICY: DirectivePolicy = {
  has_pending_proposals: {
    priority: 1,
    tieBreak: "has_pending_proposals",
    eligibleStates: ["returning_no_page", "draft_ready", "active_fresh", "active_stale"],
    incompatibleWith: [],
    build: (ctx) => pendingProposalsDirective(ctx.pendingProposalCount, ctx.pendingProposalSections),
  },
  has_thin_sections: {
    priority: 3,
    tieBreak: "has_thin_sections",
    // active_fresh EXCLUDED: its policy explicitly says "do not suggest improvements"
    eligibleStates: ["returning_no_page", "draft_ready", "active_stale"],
    incompatibleWith: ["has_archivable_facts"],
    build: (ctx) => thinSectionsDirective(ctx.thinSections),
  },
  has_stale_facts: {
    priority: 2,
    tieBreak: "has_stale_facts",
    eligibleStates: ["active_fresh", "active_stale"],
    incompatibleWith: [],
    build: (ctx) => staleFactsDirective(ctx.staleFacts),
  },
  has_open_conflicts: {
    priority: 1,
    tieBreak: "has_open_conflicts",
    eligibleStates: ["returning_no_page", "draft_ready", "active_fresh", "active_stale"],
    incompatibleWith: [],
    build: (ctx) => openConflictsDirective(ctx.openConflicts),
  },
  has_archivable_facts: {
    priority: 4,
    tieBreak: "has_archivable_facts",
    // Only meaningful when page is stale and there's accumulated clutter
    eligibleStates: ["active_stale"],
    incompatibleWith: ["has_thin_sections"],
    build: (ctx) => archivableFactsDirective(ctx.archivableFacts),
  },
  has_recent_import: {
    priority: 1,
    tieBreak: "has_recent_import",
    eligibleStates: ["returning_no_page", "draft_ready", "active_fresh", "active_stale"],
    incompatibleWith: [],
    // importGapReport may be undefined when has_recent_import comes from detectSituations
    // (connector facts). Guard: skip directive if report not available.
    build: (ctx) => ctx.importGapReport ? recentImportDirective(ctx.importGapReport) : "",
  },
  // Signal-only situations — never produce directives
  has_name: {
    priority: 99, tieBreak: "has_name", eligibleStates: [], incompatibleWith: [],
    build: () => "",
  },
  has_soul: {
    priority: 99, tieBreak: "has_soul", eligibleStates: [], incompatibleWith: [],
    build: () => "",
  },
  has_pending_soul_proposals: {
    priority: 2,
    tieBreak: "has_pending_soul_proposals",
    // first_visit included: state can persist many turns; proposals must surface promptly
    eligibleStates: ["first_visit", "returning_no_page", "draft_ready", "active_fresh", "active_stale"],
    incompatibleWith: [],
    build: (ctx) => pendingSoulProposalsDirective(ctx.pendingSoulProposals ?? []),
  },
};

function resolveIncompatibilities(
  eligible: Situation[],
  journeyState: JourneyState,
): Situation[] {
  const dropped = new Set<Situation>();

  for (let i = 0; i < eligible.length; i++) {
    const s = eligible[i];
    if (dropped.has(s)) continue;

    for (const incompatible of DIRECTIVE_POLICY[s].incompatibleWith) {
      if (!eligible.includes(incompatible) || dropped.has(incompatible)) continue;

      const winnerPriority = DIRECTIVE_POLICY[s].priority;
      const loserPriority = DIRECTIVE_POLICY[incompatible].priority;

      // s wins (lower priority number = higher importance)
      const msg =
        `[directive-registry] Conflict: ${s}(p=${winnerPriority}) ` +
        `vs ${incompatible}(p=${loserPriority}) in ${journeyState} — ${incompatible} dropped`;

      if (winnerPriority === loserPriority) {
        // Equal priority incompatible directives = policy bug.
        // Throw in all environments — validateDirectivePolicy() runs at startup
        // and will catch this before production traffic reaches it.
        throw new DirectiveConflictError(msg);
      }
      if (process.env.NODE_ENV === "development") console.warn(msg);

      // Only log when the conflict is UNEXPECTED (equal-priority — should never happen in prod
      // since validateDirectivePolicy() prevents it at startup). Expected priority-resolved
      // conflicts (the common case) are silent to avoid per-turn DB writes.
      if (process.env.NODE_ENV !== "production" || winnerPriority === loserPriority) {
        logEvent({ eventType: "directive_conflict_resolved", actor: "system", payload: {
          winner: s, dropped: incompatible, journeyState,
          winnerPriority, droppedPriority: loserPriority,
        } });
      }

      dropped.add(incompatible);
    }
  }

  return eligible.filter(s => !dropped.has(s));
}

export function getSituationDirectives(
  situations: Situation[],
  journeyState: JourneyState,
  context: SituationContext,
): string {
  const eligible = situations
    .filter(s => DIRECTIVE_POLICY[s].eligibleStates.includes(journeyState))
    .sort((a, b) => {
      const diff = DIRECTIVE_POLICY[a].priority - DIRECTIVE_POLICY[b].priority;
      if (diff !== 0) return diff;
      // Deterministic tie-break: alphabetical by tieBreak string
      return DIRECTIVE_POLICY[a].tieBreak.localeCompare(DIRECTIVE_POLICY[b].tieBreak);
    });

  const resolved = resolveIncompatibilities(eligible, journeyState);

  const parts: string[] = [];
  for (const s of resolved) {
    const ctx = getCtxFor(s, context);
    if (ctx === null) continue; // missing field — already logged
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = DIRECTIVE_POLICY[s].build(ctx as any);
    if (text) parts.push(text);
  }

  return parts.length > 0 ? `SITUATION DIRECTIVES:\n${parts.join("\n\n")}` : "";
}
