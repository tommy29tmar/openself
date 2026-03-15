import { eq, and } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { sectionCopyProposals, sectionCopyState } from "@/lib/db/schema";
import {
  computeHash,
  computeSectionFactsHash,
} from "@/lib/services/personalization-hashing";
import { filterPublishableFacts } from "@/lib/services/page-projection";
import { getProjectedFacts } from "@/lib/services/fact-cluster-service";
import { getActiveSoul } from "@/lib/services/soul-service";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import {
  getFactDisplayOverrideService,
  computeFactValueHash,
  filterEditableFields,
} from "@/lib/services/fact-display-override-service";

/** Safe JSON parse — returns null on failure instead of throwing */
function safeJsonParse(s: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** Known content fields that can be added even if not in current */
const ADDITIVE_FIELDS = new Set([
  "text", "description", "intro", "title", "frequency",
  "groups", "items", "links",
]);

/**
 * Merge proposed delta fields into current content.
 * Only overlays keys that exist in current OR are known additive content fields.
 * Null/undefined values in proposed are ignored (treated as "no change").
 */
export function deepMergeProposal(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...current };
  for (const [key, val] of Object.entries(proposed)) {
    if (val === null || val === undefined) continue;
    if (key in current || ADDITIVE_FIELDS.has(key)) {
      merged[key] = val;
    }
  }
  return merged;
}

export type CreateProposalInput = {
  ownerKey: string;
  sectionType: string;
  language: string;
  currentContent: string;
  proposedContent: string;
  issueType: string;
  reason: string;
  severity: "low" | "medium";
  factsHash: string;
  soulHash: string;
  baselineStateHash: string;
};

export type ProposalRow = {
  id: number;
  ownerKey: string;
  sectionType: string;
  language: string;
  currentContent: string;
  proposedContent: string;
  issueType: string;
  reason: string;
  severity: string;
  status: string;
  factsHash: string;
  soulHash: string;
  baselineStateHash: string;
  createdAt: string | null;
  reviewedAt: string | null;
};

function rowToProposal(row: Record<string, unknown>): ProposalRow {
  return {
    id: row.id as number,
    ownerKey: row.ownerKey as string,
    sectionType: row.sectionType as string,
    language: row.language as string,
    currentContent: row.currentContent as string,
    proposedContent: row.proposedContent as string,
    issueType: row.issueType as string,
    reason: row.reason as string,
    severity: row.severity as string,
    status: row.status as string,
    factsHash: row.factsHash as string,
    soulHash: row.soulHash as string,
    baselineStateHash: row.baselineStateHash as string,
    createdAt: (row.createdAt as string) ?? null,
    reviewedAt: (row.reviewedAt as string) ?? null,
  };
}

/**
 * Factory for the proposal service.
 * Accepts an optional Drizzle DB instance for testing with in-memory SQLite.
 */
export function createProposalService(db: typeof defaultDb = defaultDb) {
  const svc = {
    /**
     * Create a new conformity proposal (status: pending).
     */
    createProposal(input: CreateProposalInput): void {
      db.insert(sectionCopyProposals)
        .values({
          ownerKey: input.ownerKey,
          sectionType: input.sectionType,
          language: input.language,
          currentContent: input.currentContent,
          proposedContent: input.proposedContent,
          issueType: input.issueType,
          reason: input.reason,
          severity: input.severity,
          factsHash: input.factsHash,
          soulHash: input.soulHash,
          baselineStateHash: input.baselineStateHash,
        })
        .run();
    },

    /**
     * Get all pending proposals for an owner.
     */
    getPendingProposals(ownerKey: string): ProposalRow[] {
      const rows = db
        .select()
        .from(sectionCopyProposals)
        .where(
          and(
            eq(sectionCopyProposals.ownerKey, ownerKey),
            eq(sectionCopyProposals.status, "pending"),
          ),
        )
        .all();

      return rows.map((r) => rowToProposal(r));
    },

    /**
     * Get a single proposal by ID.
     */
    getProposal(id: number, ownerKey?: string): ProposalRow | null {
      const row = ownerKey
        ? db
            .select()
            .from(sectionCopyProposals)
            .where(
              and(
                eq(sectionCopyProposals.id, id),
                eq(sectionCopyProposals.ownerKey, ownerKey),
              ),
            )
            .get()
        : db
            .select()
            .from(sectionCopyProposals)
            .where(eq(sectionCopyProposals.id, id))
            .get();

      return row ? rowToProposal(row) : null;
    },

    /**
     * Accept a proposal with guards:
     * 1. STALE_PROPOSAL — factsHash or soulHash changed since proposal creation
     * 2. STATE_CHANGED — active copy was modified after proposal creation
     *
     * On success, upserts the proposed content into section_copy_state.
     */
    acceptProposal(id: number, ownerKey?: string): { ok: boolean; error?: string } {
      const proposal = svc.getProposal(id, ownerKey);
      if (!proposal || proposal.status !== "pending") {
        return { ok: false, error: "PROPOSAL_NOT_FOUND" };
      }

      // --- Item-level curation: route to fact_display_overrides ---
      if (proposal.issueType === "curation" && proposal.reason.startsWith("[item:")) {
        const factIdMatch = proposal.reason.match(/^\[item:([^\]]+)\]/);
        if (factIdMatch) {
          const factId = factIdMatch[1];

          const scope = resolveOwnerScopeForWorker(proposal.ownerKey);
          const facts = getProjectedFacts(
            scope.knowledgePrimaryKey,
            scope.knowledgeReadKeys,
          );
          const fact = facts.find((f: { id: string }) => f.id === factId);
          if (!fact) {
            return { ok: false, error: "FACT_NOT_FOUND" };
          }

          const rawFields = JSON.parse(proposal.proposedContent);
          const displayFields = filterEditableFields(
            (fact as { category: string }).category,
            rawFields,
          );
          if (Object.keys(displayFields).length === 0) {
            return { ok: false, error: "NO_EDITABLE_FIELDS" };
          }

          const overrideService = getFactDisplayOverrideService();
          overrideService.upsertOverride({
            ownerKey: proposal.ownerKey,
            factId,
            displayFields,
            factValueHash: computeFactValueHash(fact.value),
            source: "worker",
          });

          db.update(sectionCopyProposals)
            .set({ status: "accepted", reviewedAt: new Date().toISOString() })
            .where(
              and(
                eq(sectionCopyProposals.id, id),
                eq(sectionCopyProposals.ownerKey, proposal.ownerKey),
              ),
            )
            .run();

          return { ok: true };
        }
      }

      // Guard 1: STALE_PROPOSAL — facts or soul changed
      const scope = resolveOwnerScopeForWorker(proposal.ownerKey);
      const facts = getProjectedFacts(
        scope.knowledgePrimaryKey,
        scope.knowledgeReadKeys,
      );
      const publishable = filterPublishableFacts(facts);
      const currentFactsHash = computeSectionFactsHash(
        publishable,
        proposal.sectionType,
      );
      const soul = getActiveSoul(proposal.ownerKey);
      const currentSoulHash = soul?.compiled
        ? computeHash(soul.compiled)
        : "";

      if (
        proposal.factsHash !== currentFactsHash ||
        proposal.soulHash !== currentSoulHash
      ) {
        svc.markStale(id, proposal.ownerKey);
        return { ok: false, error: "STALE_PROPOSAL" };
      }

      // Guard 2: STATE_CHANGED — active copy changed since proposal
      const activeState = db
        .select()
        .from(sectionCopyState)
        .where(
          and(
            eq(sectionCopyState.ownerKey, proposal.ownerKey),
            eq(sectionCopyState.sectionType, proposal.sectionType),
            eq(sectionCopyState.language, proposal.language),
          ),
        )
        .get();

      if (activeState) {
        const currentStateHash = computeHash(
          (activeState as Record<string, unknown>)
            .personalizedContent as string,
        );
        if (currentStateHash !== proposal.baselineStateHash) {
          svc.markStale(id, proposal.ownerKey);
          return { ok: false, error: "STATE_CHANGED" };
        }
      }

      // All guards pass — merge proposed delta into current, then upsert
      const currentObj = safeJsonParse(proposal.currentContent);
      const proposedObj = safeJsonParse(proposal.proposedContent);
      const mergedContent = currentObj && proposedObj
        ? JSON.stringify(deepMergeProposal(currentObj, proposedObj))
        : proposal.proposedContent; // fallback for plain-string content

      db.insert(sectionCopyState)
        .values({
          ownerKey: proposal.ownerKey,
          sectionType: proposal.sectionType,
          language: proposal.language,
          personalizedContent: mergedContent,
          factsHash: proposal.factsHash,
          soulHash: proposal.soulHash,
          source: "proposal",
        })
        .onConflictDoUpdate({
          target: [
            sectionCopyState.ownerKey,
            sectionCopyState.sectionType,
            sectionCopyState.language,
          ],
          set: {
            personalizedContent: mergedContent,
            factsHash: proposal.factsHash,
            soulHash: proposal.soulHash,
            source: "proposal",
            approvedAt: new Date().toISOString(),
          },
        })
        .run();

      db.update(sectionCopyProposals)
        .set({ status: "accepted", reviewedAt: new Date().toISOString() })
        .where(
          and(
            eq(sectionCopyProposals.id, id),
            eq(sectionCopyProposals.ownerKey, proposal.ownerKey),
          ),
        )
        .run();

      return { ok: true };
    },

    /**
     * Reject a proposal — marks as rejected with timestamp.
     */
    rejectProposal(id: number, ownerKey?: string): { ok: boolean; error?: string } {
      const result = ownerKey
        ? db.update(sectionCopyProposals)
            .set({ status: "rejected", reviewedAt: new Date().toISOString() })
            .where(
              and(
                eq(sectionCopyProposals.id, id),
                eq(sectionCopyProposals.ownerKey, ownerKey),
                eq(sectionCopyProposals.status, "pending"),
              ),
            )
            .run()
        : db.update(sectionCopyProposals)
        .set({ status: "rejected", reviewedAt: new Date().toISOString() })
        .where(
          and(
            eq(sectionCopyProposals.id, id),
            eq(sectionCopyProposals.status, "pending"),
          ),
        )
        .run();

      if (result.changes !== 1) {
        return { ok: false, error: "PROPOSAL_NOT_FOUND" };
      }

      return { ok: true };
    },

    /**
     * Mark a single proposal as stale.
     */
    markStale(id: number, ownerKey?: string): void {
      const query = db.update(sectionCopyProposals)
        .set({ status: "stale" })
        .where(
          ownerKey
            ? and(
                eq(sectionCopyProposals.id, id),
                eq(sectionCopyProposals.ownerKey, ownerKey),
              )
            : eq(sectionCopyProposals.id, id),
        );
      query.run();
    },

    /**
     * Scan all pending proposals for an owner and mark any whose
     * facts, soul, or baseline state have changed as stale.
     * Returns the number of proposals marked stale.
     */
    markStaleProposals(ownerKey: string): number {
      const scope = resolveOwnerScopeForWorker(ownerKey);
      const facts = getProjectedFacts(
        scope.knowledgePrimaryKey,
        scope.knowledgeReadKeys,
      );
      const publishable = filterPublishableFacts(facts);
      const soul = getActiveSoul(ownerKey);
      const currentSoulHash = soul?.compiled
        ? computeHash(soul.compiled)
        : "";

      const pending = svc.getPendingProposals(ownerKey);
      let staleCount = 0;

      for (const proposal of pending) {
        const currentFactsHash = computeSectionFactsHash(
          publishable,
          proposal.sectionType,
        );
        let isStale = false;

        if (
          proposal.factsHash !== currentFactsHash ||
          proposal.soulHash !== currentSoulHash
        ) {
          isStale = true;
        }

        if (!isStale) {
          const activeState = db
            .select()
            .from(sectionCopyState)
            .where(
              and(
                eq(sectionCopyState.ownerKey, proposal.ownerKey),
                eq(sectionCopyState.sectionType, proposal.sectionType),
                eq(sectionCopyState.language, proposal.language),
              ),
            )
            .get();

          if (activeState) {
            const currentStateHash = computeHash(
              (activeState as Record<string, unknown>)
                .personalizedContent as string,
            );
            if (currentStateHash !== proposal.baselineStateHash) {
              isStale = true;
            }
          }
        }

        if (isStale) {
          svc.markStale(proposal.id);
          staleCount++;
        }
      }

      return staleCount;
    },
  };
  return svc;
}

// Default singleton
const svc = createProposalService();
export const {
  createProposal,
  getPendingProposals,
  getProposal,
  acceptProposal,
  rejectProposal,
  markStale,
  markStaleProposals,
} = svc;
