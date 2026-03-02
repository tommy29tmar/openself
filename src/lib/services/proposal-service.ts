import { eq, and } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { sectionCopyProposals, sectionCopyState } from "@/lib/db/schema";
import {
  computeHash,
  computeSectionFactsHash,
} from "@/lib/services/personalization-hashing";
import { filterPublishableFacts } from "@/lib/services/page-projection";
import { getActiveFacts } from "@/lib/services/kb-service";
import { getActiveSoul } from "@/lib/services/soul-service";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";

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
    getProposal(id: number): ProposalRow | null {
      const row = db
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
    acceptProposal(id: number): { ok: boolean; error?: string } {
      const proposal = svc.getProposal(id);
      if (!proposal || proposal.status !== "pending") {
        return { ok: false, error: "PROPOSAL_NOT_FOUND" };
      }

      // Guard 1: STALE_PROPOSAL — facts or soul changed
      const scope = resolveOwnerScopeForWorker(proposal.ownerKey);
      const facts = getActiveFacts(
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
        svc.markStale(id);
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
          svc.markStale(id);
          return { ok: false, error: "STATE_CHANGED" };
        }
      }

      // All guards pass — upsert into section_copy_state
      db.insert(sectionCopyState)
        .values({
          ownerKey: proposal.ownerKey,
          sectionType: proposal.sectionType,
          language: proposal.language,
          personalizedContent: proposal.proposedContent,
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
            personalizedContent: proposal.proposedContent,
            factsHash: proposal.factsHash,
            soulHash: proposal.soulHash,
            source: "proposal",
            approvedAt: new Date().toISOString(),
          },
        })
        .run();

      db.update(sectionCopyProposals)
        .set({ status: "accepted", reviewedAt: new Date().toISOString() })
        .where(eq(sectionCopyProposals.id, id))
        .run();

      return { ok: true };
    },

    /**
     * Reject a proposal — marks as rejected with timestamp.
     */
    rejectProposal(id: number): void {
      db.update(sectionCopyProposals)
        .set({ status: "rejected", reviewedAt: new Date().toISOString() })
        .where(eq(sectionCopyProposals.id, id))
        .run();
    },

    /**
     * Mark a single proposal as stale.
     */
    markStale(id: number): void {
      db.update(sectionCopyProposals)
        .set({ status: "stale" })
        .where(eq(sectionCopyProposals.id, id))
        .run();
    },

    /**
     * Scan all pending proposals for an owner and mark any whose
     * facts, soul, or baseline state have changed as stale.
     * Returns the number of proposals marked stale.
     */
    markStaleProposals(ownerKey: string): number {
      const scope = resolveOwnerScopeForWorker(ownerKey);
      const facts = getActiveFacts(
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
