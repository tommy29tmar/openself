import { tool } from "ai";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  createFact,
  deleteFact,
  searchFacts,
  getActiveFacts,
  getFactById,
  setFactVisibility,
  VisibilityTransitionError,
  factExistsAcrossReadKeys,
  findFactsByOwnerCategoryKey,
} from "@/lib/services/kb-service";
import { db } from "@/lib/db";
import { facts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { FactConstraintError } from "@/lib/services/fact-constraints";
import { logTrustAction } from "@/lib/services/trust-ledger-service";
import { getDraft, upsertDraft, requestPublish, computeConfigHash } from "@/lib/services/page-service";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { type PageConfig } from "@/lib/page-config/schema";
import { listSurfaces, listVoices } from "@/lib/presence";
import { logEvent } from "@/lib/services/event-service";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { translatePageContent } from "@/lib/ai/translate";
import { saveMemory, type MemoryType } from "@/lib/services/memory-service";
import { proposeSoulChange, reviewProposal, getActiveSoul, type SoulOverlay } from "@/lib/services/soul-service";
import { resolveConflict } from "@/lib/services/conflict-service";
import {
  insertEvent, queryEvents, countEventsByType, countKeywordEvents,
  resolveEpisodicProposal, getEpisodicProposalById, acceptEpisodicProposalAsActivity,
} from "@/lib/services/episodic-service";
import { enqueueJob } from "@/lib/worker/index";
import { FactValidationError } from "@/lib/services/fact-validation";
import { LAYOUT_TEMPLATES, resolveLayoutAlias } from "@/lib/layout/contracts";
import { getLayoutTemplate, resolveLayoutTemplate } from "@/lib/layout/registry";
import { assignSlotsFromFacts } from "@/lib/layout/assign-slots";
import { extractLocks } from "@/lib/layout/lock-policy";
import { groupSectionsBySlot } from "@/lib/layout/group-slots";
import { toSlotAssignments, canFullyValidateSection } from "@/lib/layout/validate-adapter";
import { validateLayoutComposition } from "@/lib/layout/quality";
import { buildWidgetMap, getBestWidget, getWidgetById } from "@/lib/layout/widgets";
import { isSectionComplete } from "@/lib/page-config/section-completeness";
import { classifySectionRichness } from "@/lib/services/section-richness";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { validateUsernameFormat } from "@/lib/page-config/usernames";
import { personalizeSection, prioritizeSections } from "@/lib/services/section-personalizer";
import { filterPublishableFacts, projectCanonicalConfig, type DraftMeta } from "@/lib/services/page-projection";
import { detectImpactedSections } from "@/lib/services/personalization-impact";
import { computeHash, SECTION_FACT_CATEGORIES } from "@/lib/services/personalization-hashing";
import { updateJourneyStatePin } from "@/lib/agent/journey";
import { checkPageCoherence } from "@/lib/services/coherence-check";
import { mergeSessionMeta, getSessionMeta } from "@/lib/services/session-metadata";
import type { JournalEntry } from "@/lib/services/session-metadata";
import { hashValue, type PendingConfirmation } from "@/lib/services/confirmation-service";
import { getFactDisplayOverrideService, computeFactValueHash, filterEditableFields, ITEM_EDITABLE_FIELDS } from "@/lib/services/fact-display-override-service";
import { PERSONALIZABLE_FIELDS } from "@/lib/services/personalizer-schemas";
import { upsertState as upsertCopyState } from "@/lib/services/section-copy-state-service";
import { computeSectionFactsHash } from "@/lib/services/personalization-hashing";

function evaluateLayoutPublishability(config: PageConfig): {
  valid: boolean;
  issues: string[];
} {
  const resolvedTemplate = resolveLayoutTemplate(config);
  const allSectionsValidatable = config.sections.every((section) =>
    canFullyValidateSection(section),
  );

  const sectionsForValidation = allSectionsValidatable
    ? config.sections
    : assignSlotsFromFacts(
        resolvedTemplate,
        config.sections,
        undefined,
        { repair: false },
      ).sections;

  const conversion = toSlotAssignments(sectionsForValidation);
  const layoutIssues = [
    ...conversion.skipped.map(
      (section) => `${section.sectionId} (${section.reason})`,
    ),
  ];

  if (conversion.skipped.length === 0) {
    const widgetMap = buildWidgetMap();
    const layoutResult = validateLayoutComposition(
      resolvedTemplate,
      conversion.assignments,
      widgetMap,
    );
    layoutIssues.push(
      ...layoutResult.all
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message),
    );
  }

  return {
    valid: layoutIssues.length === 0,
    issues: layoutIssues,
  };
}

export function createAgentTools(
  sessionLanguage: string = "en",
  sessionId: string = "__default__",
  ownerKey?: string,
  requestId?: string,
  readKeys?: string[],
  mode?: string,
  authInfo?: { authenticated?: boolean; username?: string | null },
  provenanceSessionId?: string,
  provenanceMessageId?: string,
) {
  const effectiveOwnerKey = ownerKey ?? sessionId;
  const eventSessionId = provenanceSessionId ?? sessionId;
  const operationJournal: JournalEntry[] = [];
  const publishAuth = {
    authenticated: !!authInfo?.authenticated,
    username: authInfo?.username ?? null,
  };

  function extractLatestUserText(messages: unknown): string | null {
    if (!Array.isArray(messages)) return null;

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message || typeof message !== "object") continue;

      const candidate = message as { role?: unknown; content?: unknown };
      if (candidate.role !== "user") continue;

      if (typeof candidate.content === "string" && candidate.content.trim().length > 0) {
        return candidate.content;
      }
    }

    return null;
  }

  async function validatePublishUsername(requestedUsername: string) {
    const effectiveUsername = publishAuth.username ?? requestedUsername;

    if (!effectiveUsername || effectiveUsername.length === 0) {
      return {
        effectiveUsername,
        validation: {
          ok: false as const,
          code: "USERNAME_INVALID",
          message: "Username is required.",
        },
      };
    }

    if (isMultiUserEnabled() && !publishAuth.username) {
      const { validateUsernameAvailability } = await import("@/lib/services/username-validation");
      return {
        effectiveUsername,
        validation: validateUsernameAvailability(effectiveUsername),
      };
    }

    return {
      effectiveUsername,
      validation: validateUsernameFormat(effectiveUsername),
    };
  }

  // --- Layer 2+3: Cross-turn pending confirmations with TTL ---
  const TTL_MS = 5 * 60 * 1000;
  const meta = getSessionMeta(sessionId);
  let pendings: PendingConfirmation[] = (Array.isArray(meta?.pendingConfirmations) ? meta.pendingConfirmations : []) as PendingConfirmation[];
  const now = Date.now();
  const originalLength = pendings.length;
  pendings = pendings.filter(p => now - new Date(p.createdAt).getTime() < TTL_MS);
  if (pendings.length !== originalLength) {
    mergeSessionMeta(sessionId, { pendingConfirmations: pendings.length > 0 ? pendings : null });
  }

  // --- Layer 1: Intra-turn latches ---
  let _identityBlockedThisTurn = false;
  let _deleteBlockedThisTurn = false;
  let _deletionCountThisTurn = 0;
  const _batchPendingIdsThisTurn = new Set<string>();

  /**
   * Identity overwrite gate. Returns null if allowed, or a message object if blocked.
   */
  function identityGate(
    category: string,
    key: string,
    proposedValue: Record<string, unknown>,
    factId?: string,
  ): { requiresConfirmation: true; message: string } | null {
    if (category !== "identity") return null;
    if (_identityBlockedThisTurn) {
      return { requiresConfirmation: true, message: "Identity changes blocked this turn — wait for user confirmation in a new message." };
    }

    // Determine if this is an overwrite (existing identity fact)
    let isOverwrite = false;
    if (factId) {
      const existing = getFactById(factId, sessionId, readKeys);
      isOverwrite = existing?.category === "identity";
    } else {
      isOverwrite = factExistsAcrossReadKeys(sessionId, readKeys, category, key);
    }
    if (!isOverwrite) return null; // first creation (onboarding) — allow

    // Check pending (exact match: type + category + key + valueHash)
    const vh = hashValue(proposedValue);
    const matchIdx = pendings.findIndex(p =>
      p.type === "identity_overwrite" &&
      p.category === category &&
      p.key === key &&
      p.valueHash === vh
    );
    if (matchIdx >= 0) {
      pendings.splice(matchIdx, 1); // consume
      mergeSessionMeta(sessionId, { pendingConfirmations: pendings.length ? pendings : null });
      return null; // allowed
    }

    // Block
    _identityBlockedThisTurn = true;
    pendings.push({
      id: randomUUID(),
      type: "identity_overwrite",
      category,
      key,
      valueHash: vh,
      createdAt: new Date().toISOString(),
    });
    mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
    return { requiresConfirmation: true, message: `Changing identity/${key} requires confirmation. Explain to the user what will change (old → new value) and ask them to confirm. The pending confirmation is stored — when they confirm in their next message, retry the same tool call with the same target and value.` };
  }

  /**
   * Identity delete gate. Returns null if allowed, or a confirmation-required object if blocked.
   */
  function identityDeleteGate(category: string, key: string): { requiresConfirmation: true; message: string } | null {
    if (category !== "identity") return null;
    if (_identityBlockedThisTurn) {
      return { requiresConfirmation: true, message: "Identity changes blocked this turn — wait for user confirmation in a new message." };
    }
    const existing = pendings.find(p => p.type === "identity_delete" && p.category === category && p.key === key);
    if (existing) {
      pendings.splice(pendings.indexOf(existing), 1);
      mergeSessionMeta(sessionId, { pendingConfirmations: pendings.length ? pendings : null });
      return null;
    }
    pendings.push({
      id: randomUUID(),
      type: "identity_delete",
      category,
      key,
      createdAt: new Date().toISOString(),
    });
    _identityBlockedThisTurn = true;
    mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
    return { requiresConfirmation: true, message: `Deleting identity/${key} requires confirmation. Explain to the user what will be removed and ask them to confirm.` };
  }

  // --- Stable deep equality for duplicate detection ---
  function stableDeepEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  }
  function sortKeys(obj: unknown): unknown {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortKeys(v)])
    );
  }

  type DeleteGateResult =
    | { requiresConfirmation: true; message: string }
    | { allowed: true; commit: () => void; consumeOnly?: () => void };

  function deleteGate(factId: string, opts?: { preConfirmed?: boolean }): DeleteGateResult | null {
    // Consume any existing pending for this factId regardless of preConfirmed
    const matchIdx = pendings.findIndex(p => p.type === "bulk_delete" && !p.confirmationId && p.factIds?.includes(factId));
    if (matchIdx >= 0) {
      const pending = pendings[matchIdx];

      const consumePending = () => {
        pending.factIds = pending.factIds!.filter((id: string) => id !== factId);
        if (pending.factIds!.length === 0) {
          pendings.splice(matchIdx, 1);
        }
        mergeSessionMeta(sessionId, { pendingConfirmations: pendings.length ? pendings : null });
      };

      if (opts?.preConfirmed) {
        consumePending();
        return {
          allowed: true,
          commit: () => { _deletionCountThisTurn++; },
          consumeOnly: () => {},
        };
      }

      return {
        allowed: true,
        commit: () => { consumePending(); _deletionCountThisTurn++; },
        consumeOnly: () => { consumePending(); },
      };
    }

    // Pre-confirmed: skip all gating, just allow
    if (opts?.preConfirmed) {
      return {
        allowed: true,
        commit: () => { _deletionCountThisTurn++; },
        consumeOnly: () => {},
      };
    }

    if (_deleteBlockedThisTurn) {
      const existingPending = pendings.find(p => p.type === "bulk_delete" && !p.confirmationId);
      if (existingPending?.factIds && !existingPending.factIds.includes(factId)) {
        existingPending.factIds.push(factId);
        mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
      }
      return { requiresConfirmation: true, message: "Further deletions blocked this turn — wait for user confirmation in a new message." };
    }

    // Unconfirmed: allow first, block 2nd+
    if (_deletionCountThisTurn >= 1) {
      _deleteBlockedThisTurn = true;
      pendings.push({
        id: randomUUID(),
        type: "bulk_delete",
        factIds: [factId],
        createdAt: new Date().toISOString(),
      });
      mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
      return { requiresConfirmation: true, message: "2nd+ deletion in this turn requires confirmation. List the items to delete and ask the user to confirm." };
    }

    // First unconfirmed delete — allowed, but defer counting until caller confirms success
    return { allowed: true, commit: () => { _deletionCountThisTurn++; } };
  }

  /** Auto-compose draft from facts if none exists yet. */
  function ensureDraft(): PageConfig {
    const existing = getDraft(sessionId);
    if (existing) return existing.config;
    const allFacts = getActiveFacts(sessionId, readKeys);
    if (allFacts.length === 0) throw new Error("No facts yet — ask the user for information first");
    const factLang = getFactLanguage(sessionId) ?? sessionLanguage;
    const composed = composeOptimisticPage(allFacts, "draft", factLang, undefined, undefined, effectiveOwnerKey);
    upsertDraft("draft", composed, sessionId);
    return composed;
  }

  /**
   * Recompose draft after fact mutations to keep preview in sync.
   *
   * Uses projectCanonicalConfig() — the same function used by preview/stream —
   * which handles: section order preservation, lock metadata merging,
   * theme/style/layoutTemplate carry-over from existing draft.
   *
   * Anti-loop: _recomposing flag prevents re-entry.
   * Idempotency: computeConfigHash(composed) compared to draft.configHash
   * (both are SHA-256 of full config JSON). Skip upsertDraft on match.
   */
  let _recomposing = false;
  function recomposeAfterMutation(): void {
    if (_recomposing) return;
    _recomposing = true;
    try {
      const allFacts = getActiveFacts(sessionId, readKeys);
      if (allFacts.length === 0) return;
      const factLang = getFactLanguage(sessionId) ?? sessionLanguage;
      const currentDraft = getDraft(sessionId);

      // Build DraftMeta for order/lock/style preservation
      const draftMeta: DraftMeta | undefined = currentDraft
        ? {
            surface: currentDraft.config.surface,
            voice: currentDraft.config.voice,
            light: currentDraft.config.light,
            style: currentDraft.config.style,
            layoutTemplate: currentDraft.config.layoutTemplate,
            sections: currentDraft.config.sections,
          }
        : undefined;

      const composed = projectCanonicalConfig(
        allFacts,
        currentDraft?.username ?? "draft",
        factLang,
        draftMeta,
        effectiveOwnerKey,
      );

      // Idempotency: skip write if hash matches
      const composedHash = computeConfigHash(composed);
      if (composedHash === currentDraft?.configHash) {
        logEvent({ eventType: "recompose_skip", actor: "system", payload: { requestId, reason: "hash_match", hash: composedHash } });
        return;
      }

      upsertDraft(currentDraft?.username ?? "draft", composed, sessionId);
    } finally {
      _recomposing = false;
    }
  }

  const tools = {
  create_fact: tool({
    description:
      "Store a new fact about the user in the knowledge base. Use this whenever the user shares information about themselves (name, job, skills, interests, projects, etc). Break complex info into separate atomic facts.",
    parameters: z.object({
      category: z
        .string()
        .describe(
          "Fact category: identity, experience, education, project, skill, interest, achievement, stat, activity, social, reading, music, language, contact, or any relevant category",
        ),
      key: z
        .string()
        .describe(
          "Unique key within the category (e.g., 'typescript' for a skill, 'acme-corp' for experience). Use lowercase kebab-case.",
        ),
      value: z
        .preprocess((v) => {
          if (typeof v === "object" && v !== null) return v;
          if (typeof v === "string") {
            try { return JSON.parse(v); } catch { /* fall through */ }
            // Handle JS object literal syntax: {key: "val"} → {"key": "val"}
            try { return JSON.parse(v.replace(/([{,]\s*)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3')); } catch { /* fall through */ }
          }
          return v;
        }, z.record(z.unknown()))
        .describe(
          "REQUIRED. Structured value object. Examples: {name: 'TypeScript', level: 'advanced'} for skills, {full: 'Tommaso Rossi'} for identity name, {role: 'economist', company: 'Acme', status: 'current'} for experience, {institution: 'MIT', degree: 'MSc', field: 'Computer Science', period: '2018-2020'} for education, {label: 'Years Experience', value: '10+'} for stat, {language: 'Spanish', proficiency: 'fluent'} for language, {type: 'email', value: 'me@example.com'} for contact, {title: 'Clean Code', author: 'Robert Martin', rating: 5} for reading, {title: 'Bohemian Rhapsody', artist: 'Queen'} for music, {name: 'Tennis', activityType: 'sport', frequency: 'weekly'} for activity. Use lowercase for common nouns (job titles, roles, skills) — only capitalize proper nouns (names, companies, brands). Must always be provided.",
        ),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe(
          "How confident you are: 1.0 = stated directly, 0.7 = implied, 0.5 = vague mention. Default 1.0.",
        ),
    }),
    execute: async ({ category, key, value, confidence }) => {
      try {
        // Duplicate guard — runs BEFORE identityGate
        const existingFacts = findFactsByOwnerCategoryKey(effectiveOwnerKey, category, key, readKeys);
        if (existingFacts.length > 0) {
          const isIdentical = stableDeepEqual(existingFacts[0].value, value);
          if (isIdentical) {
            return { success: true, factId: existingFacts[0].id, idempotent: true };
          }
          return {
            success: false,
            error: `A fact for ${category}/${key} already exists with a different value.`,
            hint: "To update this fact: (1) delete_fact the existing one, (2) create_fact with the new value.",
            existingFactId: existingFacts[0].id,
          };
        }

        // Identity overwrite gate
        const blocked = identityGate(category, key, value);
        if (blocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...blocked };

        const fact = await createFact({
          category,
          key,
          value,
          confidence,
        }, sessionId, effectiveOwnerKey);
        let recomposeOk = true;
        try { recomposeAfterMutation(); } catch (e) {
          recomposeOk = false;
          logEvent({ eventType: "recompose_error", actor: "system", payload: { requestId, error: String(e) } });
        }
        return {
          success: true,
          factId: fact.id,
          category: fact.category,
          key: fact.key,
          visibility: fact.visibility,
          pageVisible: fact.visibility === "public" || fact.visibility === "proposed",
          recomposeOk,
        };
      } catch (error) {
        if (error instanceof FactValidationError) {
          return { success: false, error: error.message, code: "FACT_VALIDATION_FAILED" };
        }
        if (error instanceof FactConstraintError) {
          return { success: false, code: error.code, existingFactId: error.existingFactId, suggestion: error.suggestion };
        }
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "create_fact", error: String(error), category, key },
        });
        return { success: false, error: String(error) };
      }
    },
  }),

  batch_facts: tool({
    description: "Execute multiple fact operations in order. Operations are applied sequentially (create, delete) and a single recompose runs at the end. Max 20 operations. No updates — facts are immutable (delete + create to correct).",
    parameters: z.object({
      operations: z.array(z.discriminatedUnion("action", [
        z.object({
          action: z.literal("create"),
          category: z.string(),
          key: z.string(),
          value: z.record(z.unknown()),
          source: z.string().optional(),
          confidence: z.number().optional(),
          parentFactId: z.string().optional(),
        }),
        z.object({
          action: z.literal("delete"),
          factId: z.string(),
        }),
      ])).max(20),
      confirmationId: z.string().optional().describe("Pass the confirmationId from a previous REQUIRES_CONFIRMATION response to confirm bulk deletions"),
    }),
    execute: async ({ operations, confirmationId }) => {
      if (operations.length > 20) {
        return { success: false, error: "MAX_BATCH_SIZE", message: "Maximum 20 operations per batch", created: 0, deleted: 0 };
      }

      const deleteOps = operations.filter(op => op.action === "delete");

      // Pre-flight: identity-delete enforcement (rejected from batch regardless of confirmation)
      for (const op of deleteOps) {
        const factId = (op as { factId: string }).factId;
        // Category/key format: parse directly — don't need DB lookup
        if (factId.includes("/") && !factId.match(/^[0-9a-f]{8}-/)) {
          const [cat] = factId.split("/");
          if (cat === "identity") {
            return { success: false, code: "IDENTITY_DELETE_BLOCKED", message: `Cannot delete identity fact ${factId} via batch_facts. ALWAYS use delete_fact for identity deletions — it supports the required cross-turn confirmation. Call delete_fact("${factId}") instead.`, created: 0, deleted: 0 };
          }
        } else {
          // UUID format: check via DB
          const fact = getFactById(factId, sessionId, readKeys);
          if (fact && fact.category === "identity") {
            return { success: false, code: "IDENTITY_DELETE_BLOCKED", message: `Cannot delete identity fact ${factId} via batch_facts. ALWAYS use delete_fact for identity deletions — it supports the required cross-turn confirmation. Call delete_fact("${factId}") instead.`, created: 0, deleted: 0 };
          }
        }
      }

      // Pre-flight: duplicate factId rejection
      const deleteFactIds = deleteOps.map(op => (op as { factId: string }).factId);
      const uniqueDeleteFactIds = new Set(deleteFactIds);
      if (uniqueDeleteFactIds.size !== deleteFactIds.length) {
        return { success: false, error: "DUPLICATE_FACT_IDS", message: "Duplicate factIds in delete operations", created: 0, deleted: 0 };
      }

      // Pre-flight: batch with ≥2 deletes → confirmation required
      let _batchPreflightConfirmed = false;
      let pendingToConsumeId: string | null = null;

      if (deleteOps.length >= 2) {
        if (confirmationId) {
          // Find matching pending by confirmationId
          const matchedPending = pendings.find(
            p => p.type === "bulk_delete" && p.confirmationId === confirmationId
          );
          if (matchedPending) {
            // Same-turn self-confirmation check
            if (_batchPendingIdsThisTurn.has(matchedPending.id)) {
              return { success: false, code: "REQUIRES_CONFIRMATION", requiresConfirmation: true, message: "Cannot confirm batch deletions in the same turn — wait for user confirmation in a new message.", created: 0, deleted: 0 };
            }
            // Verify factIds match (symmetric set comparison)
            const pendingSet = new Set(matchedPending.factIds ?? []);
            const requestSet = uniqueDeleteFactIds;
            const setsMatch = pendingSet.size === requestSet.size && [...pendingSet].every(id => requestSet.has(id));
            if (setsMatch) {
              _batchPreflightConfirmed = true;
              pendingToConsumeId = matchedPending.id;
            } else {
              // FactIds mismatch — issue new confirmationId
              const newConfirmationId = randomUUID();
              const newPendingId = randomUUID();
              _batchPendingIdsThisTurn.add(newPendingId);
              pendings.push({
                id: newPendingId,
                type: "bulk_delete",
                factIds: deleteFactIds,
                confirmationId: newConfirmationId,
                createdAt: new Date().toISOString(),
              });
              mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
              return { success: false, code: "REQUIRES_CONFIRMATION", requiresConfirmation: true, confirmationId: newConfirmationId, message: "Batch deletions factIds do not match the confirmed set. Re-confirm with the correct list.", created: 0, deleted: 0 };
            }
          } else {
            // No matching pending — issue new confirmationId
            const newConfirmationId = randomUUID();
            const newPendingId = randomUUID();
            _batchPendingIdsThisTurn.add(newPendingId);
            pendings.push({
              id: newPendingId,
              type: "bulk_delete",
              factIds: deleteFactIds,
              confirmationId: newConfirmationId,
              createdAt: new Date().toISOString(),
            });
            mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
            return { success: false, code: "REQUIRES_CONFIRMATION", requiresConfirmation: true, confirmationId: newConfirmationId, message: "Batch with 2+ deletions requires explicit user confirmation. List the items and ask the user to confirm.", created: 0, deleted: 0 };
          }
        } else {
          // No confirmationId provided — issue one
          const newConfirmationId = randomUUID();
          const newPendingId = randomUUID();
          _batchPendingIdsThisTurn.add(newPendingId);
          pendings.push({
            id: newPendingId,
            type: "bulk_delete",
            factIds: deleteFactIds,
            confirmationId: newConfirmationId,
            createdAt: new Date().toISOString(),
          });
          mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
          return { success: false, code: "REQUIRES_CONFIRMATION", requiresConfirmation: true, confirmationId: newConfirmationId, message: "Batch with 2+ deletions requires explicit user confirmation. List the items and ask the user to confirm.", created: 0, deleted: 0 };
        }
      }

      // Pre-flight: identity overwrites
      for (const op of operations) {
        if (op.action === "create" && op.category === "identity") {
          const blocked = identityGate(op.category, op.key, op.value);
          if (blocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...blocked, created: 0, deleted: 0 };
        }
      }

      let created = 0, deleted = 0;
      const warnings: string[] = [];
      const reverseOps: Array<{
        action: "delete" | "recreate";
        factId?: string;
        previousFact?: Record<string, unknown>;
      }> = [];

      try {
        for (const op of operations) {
          switch (op.action) {
            case "create": {
              // Duplicate guard
              const existingFacts = findFactsByOwnerCategoryKey(effectiveOwnerKey, op.category, op.key, readKeys);
              if (existingFacts.length > 0) {
                if (stableDeepEqual(existingFacts[0].value, op.value)) {
                  break; // Skip: already exists with same value
                }
                warnings.push(`Create of ${op.category}/${op.key} blocked: fact already exists with different value. Delete first.`);
                break;
              }
              const result = await createFact(
                {
                  category: op.category,
                  key: op.key,
                  value: op.value,
                  source: op.source ?? "chat",
                  confidence: op.confidence,
                  parentFactId: op.parentFactId,
                },
                sessionId,
                effectiveOwnerKey,
              );
              reverseOps.push({ action: "delete", factId: result.id });
              created++;
              break;
            }
            case "delete": {
              // Resolve category/key format (e.g. "activity/yoga") to UUID
              let resolvedId = op.factId;
              if (op.factId.includes("/") && !op.factId.match(/^[0-9a-f]{8}-/)) {
                const [cat, ...keyParts] = op.factId.split("/");
                const key = keyParts.join("/");
                const matching = findFactsByOwnerCategoryKey(effectiveOwnerKey, cat, key, readKeys);
                if (matching.length === 1) {
                  resolvedId = matching[0].id;
                } else if (matching.length === 0) {
                  warnings.push(`Delete of ${op.factId}: no fact found for category/key`);
                  break;
                } else {
                  warnings.push(`Delete of ${op.factId}: ${matching.length} facts match category/key — use UUID to disambiguate`);
                  break;
                }
              }

              if (_batchPreflightConfirmed) {
                // Confirmed batch — skip deleteGate, execute directly
                const old = getFactById(resolvedId, sessionId, readKeys);
                if (old) {
                  const { id, ...rest } = old;
                  reverseOps.push({ action: "recreate", factId: id, previousFact: rest as Record<string, unknown> });
                }
                const didDelete = deleteFact(resolvedId, sessionId, readKeys);
                if (didDelete) {
                  deleted++;
                  _deletionCountThisTurn++;
                } else {
                  warnings.push(`Delete of ${resolvedId} returned false (already gone or access denied)`);
                }
              } else {
                // Single delete within batch — apply delete gate
                const dResult = deleteGate(resolvedId);
                if (dResult && "requiresConfirmation" in dResult) {
                  warnings.push(`Delete of ${resolvedId} blocked: ${dResult.message}`);
                  break;
                }
                const old = getFactById(resolvedId, sessionId, readKeys);
                if (old) {
                  const { id, ...rest } = old;
                  reverseOps.push({ action: "recreate", factId: id, previousFact: rest as Record<string, unknown> });
                }
                const didDelete = deleteFact(resolvedId, sessionId, readKeys);
                if (didDelete) {
                  deleted++;
                  if (dResult && "commit" in dResult) dResult.commit();
                } else if (dResult && "consumeOnly" in dResult && dResult.consumeOnly) {
                  dResult.consumeOnly();
                }
              }
              break;
            }
          }
        }

        if (reverseOps.length > 0) {
          logTrustAction(effectiveOwnerKey, "batch_facts",
            `Batch: ${created} created, ${deleted} deleted`,
            { undoPayload: { action: "reverse_batch", reverseOps } },
          );
        }
        try { recomposeAfterMutation(); } catch (e) {
          logEvent({ eventType: "recompose_error", actor: "system", payload: { requestId, error: String(e), source: "batch_facts" } });
        }

        // Consume pending AFTER successful execution
        if (_batchPreflightConfirmed && pendingToConsumeId) {
          const idx = pendings.findIndex(p => p.id === pendingToConsumeId);
          if (idx >= 0) {
            pendings.splice(idx, 1);
          }
          mergeSessionMeta(sessionId, { pendingConfirmations: pendings.length > 0 ? pendings : null });
        }

        return { success: true, created, deleted, ...(warnings.length > 0 ? { warnings } : {}) };
      } catch (err) {
        // Do NOT consume pending on error — user already confirmed but execution failed
        if (reverseOps.length > 0) {
          try {
            logTrustAction(effectiveOwnerKey, "batch_facts",
              `Batch (partial): ${created} created, ${deleted} deleted — stopped by error`,
              { undoPayload: { action: "reverse_batch", reverseOps } },
            );
            recomposeAfterMutation();
          } catch (cleanupErr) {
            console.error("[batch_facts] cleanup failed after partial batch:", cleanupErr);
          }
        }

        if (err instanceof FactValidationError) {
          return { success: false, error: "VALIDATION_ERROR", message: err.message, created, deleted, hint: "Batch stopped — earlier operations were applied" };
        }
        if (err instanceof FactConstraintError) {
          return { success: false, code: err.code, existingFactId: err.existingFactId, suggestion: err.suggestion, created, deleted, hint: "Batch stopped — earlier operations were applied" };
        }
        throw err;
      }
    },
  }),

  delete_fact: tool({
    description:
      "Delete a fact. Accepts either a UUID factId or a 'category/key' format (e.g., 'education/dams-torino'). When using category/key and multiple facts match, requires user confirmation in a subsequent turn.",
    parameters: z.object({
      factId: z.string().describe("The fact ID (UUID) or category/key (e.g., 'education/dams-torino') to delete"),
    }),
    execute: async ({ factId }) => {
      try {
        if (factId.includes("/") && !factId.match(/^[0-9a-f]{8}-/)) {
          const [cat, ...keyParts] = factId.split("/");
          const key = keyParts.join("/");

          const matching = findFactsByOwnerCategoryKey(effectiveOwnerKey, cat, key, readKeys);
          if (matching.length === 0) {
            return { success: false, error: "No facts found for category/key: " + factId, hint: "Use search_facts to find available facts." };
          }
          if (matching.length === 1) {
            let identityAlreadyConfirmed = false;
            if (cat === "identity") {
              const identityBlocked = identityDeleteGate(cat, key);
              if (identityBlocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...identityBlocked };
              identityAlreadyConfirmed = true;
            }
            const dResult = deleteGate(matching[0].id, { preConfirmed: identityAlreadyConfirmed });
            if (dResult && "requiresConfirmation" in dResult) return { success: false, code: "REQUIRES_CONFIRMATION", ...dResult };
            const ok = deleteFact(matching[0].id, sessionId, readKeys);
            if (!ok) {
              if (dResult && "consumeOnly" in dResult && dResult.consumeOnly) dResult.consumeOnly();
              return { success: false, error: "Fact not found after lookup" };
            }
            if (dResult && "commit" in dResult) dResult.commit();
            try { recomposeAfterMutation(); } catch (e) {
              console.warn("[delete_fact] recompose failed:", e);
            }
            return { success: true, deletedCount: 1 };
          }
          // Multiple matches
          if (cat === "identity") {
            const identityBlocked = identityDeleteGate(cat, key);
            if (identityBlocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...identityBlocked };
          }
          return {
            success: false,
            code: "REQUIRES_CONFIRMATION",
            message: `Found ${matching.length} facts matching "${factId}". Present these to the user and ask which to delete. Then call delete_fact with the specific UUID.`,
            matchingFacts: matching.map(f => ({ id: f.id, value: typeof f.value === "string" ? f.value.slice(0, 100) : JSON.stringify(f.value).slice(0, 100) })),
          };
        }

        // UUID path
        const factToDelete = getFactById(factId, sessionId, readKeys);
        let identityAlreadyConfirmed = false;
        if (factToDelete?.category === "identity") {
          const identityBlocked = identityDeleteGate(factToDelete.category, factToDelete.key);
          if (identityBlocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...identityBlocked };
          identityAlreadyConfirmed = true;
        }
        const dResult = deleteGate(factId, { preConfirmed: identityAlreadyConfirmed });
        if (dResult && "requiresConfirmation" in dResult) return { success: false, code: "REQUIRES_CONFIRMATION", ...dResult };
        const ok = deleteFact(factId, sessionId, readKeys);
        if (!ok) {
          if (dResult && "consumeOnly" in dResult && dResult.consumeOnly) dResult.consumeOnly();
          return { success: false, error: "Fact not found", hint: "Use search_facts to find the correct factId, or use category/key format like 'education/dams-torino'." };
        }
        if (dResult && "commit" in dResult) dResult.commit();
        try { recomposeAfterMutation(); } catch (e) {
          console.warn("[delete_fact] recompose failed:", e);
        }
        return { success: true, deletedCount: 1 };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "delete_fact", error: String(error), factId },
        });
        return { success: false, error: String(error) };
      }
    },
  }),

  search_facts: tool({
    description:
      "Search the knowledge base for existing facts. Use before creating facts to avoid duplicates, or to recall what you know about the user.",
    parameters: z.object({
      query: z
        .string()
        .describe(
          "Search query — matches against category, key, and value text",
        ),
    }),
    execute: async ({ query }) => {
      try {
        const results = searchFacts(query, sessionId, readKeys);
        const mapped = results.map((f) => ({
          id: f.id,
          category: f.category,
          key: f.key,
          value: f.value,
          confidence: f.confidence,
        }));
        if (mapped.length === 0) {
          return { success: true, count: 0, facts: [], hint: "No facts matched. Try broader search terms or different keywords." };
        }
        return {
          success: true,
          count: mapped.length,
          facts: mapped,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  }),

  update_page_style: tool({
    description: "Update the page visual presence (surface, voice, light) or layout template.",
    parameters: z.object({
      username: z.string().describe("The username for the page"),
      surface: z.string().optional().describe(
        `Surface controls colors and texture. Valid values: ${listSurfaces().map(s => s.id).join(", ")}`
      ),
      voice: z.string().optional().describe(
        `Voice controls typography. Valid values: ${listVoices().map(v => v.id).join(", ")}`
      ),
      light: z.enum(["day", "night"]).optional().describe("Light mode. Works per surface."),
      layoutTemplate: z.string().optional().describe("Layout template: monolith, curator, architect, cinematic"),
    }),
    execute: async ({ username, surface, voice, light, layoutTemplate }) => {
      try {
        const styleBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const currentSession = provenanceSessionId ?? sessionId;
        const res = await fetch(new URL("/api/draft/style", styleBaseUrl).href, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cookie": `os_session=${currentSession}`,
          },
          body: JSON.stringify({ surface, voice, light, layoutTemplate }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { success: false, error: body.error ?? `HTTP ${res.status}` };
        }
        logEvent({
          eventType: "page_config_updated",
          actor: "assistant",
          payload: { username, change: "presence", surface, voice, light, layoutTemplate },
        });
        return { success: true };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: {
            tool: "update_page_style",
            error: String(error),
            username,
          },
        });
        return { success: false, error: String(error), hint: "Style update failed. Try again or ask the user to change style from the UI." };
      }
    },
  }),

  reorder_sections: tool({
    description:
      "Reorder the sections on the page. Provide the section IDs in the desired order.",
    parameters: z.object({
      username: z.string().describe("The username for the page"),
      sectionOrder: z
        .array(z.string())
        .describe("Array of section IDs in the desired display order"),
    }),
    execute: async ({ username, sectionOrder }) => {
      try {
        const existing = ensureDraft();
        const sectionMap = new Map(
          existing.sections.map((s) => [s.id, s]),
        );
        const reordered = sectionOrder
          .map((id) => sectionMap.get(id))
          .filter(Boolean);
        // Append any sections not in the new order at the end
        for (const s of existing.sections) {
          if (!sectionOrder.includes(s.id)) {
            reordered.push(s);
          }
        }
        const updated: PageConfig = {
          ...existing,
          sections: reordered as PageConfig["sections"],
        };
        // Run slot validation on reordered config
        const warnings: string[] = [];
        try {
          const template = resolveLayoutTemplate(updated);
          const { assignments } = toSlotAssignments(updated.sections);
          const validation = validateLayoutComposition(template, assignments, buildWidgetMap());
          for (const w of validation.warnings) {
            warnings.push(w.message);
          }
        } catch { /* validation is advisory, don't block reorder */ }
        upsertDraft(username, updated, sessionId);
        return { success: true, ...(warnings.length > 0 ? { warnings } : {}) };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  }),

  move_section: tool({
    description:
      "Move a section to a different layout slot. Auto-switches widget if the current one doesn't fit the target slot.",
    parameters: z.object({
      sectionId: z.string().describe("The ID of the section to move"),
      targetSlot: z.string().describe("The target slot ID (e.g., 'sidebar', 'main')"),
    }),
    execute: async ({ sectionId, targetSlot }) => {
      try {
        const draft = ensureDraft();

        const sectionIdx = draft.sections.findIndex((s) => s.id === sectionId);
        if (sectionIdx === -1) {
          return { success: false, error: "SECTION_NOT_FOUND" };
        }
        const section = draft.sections[sectionIdx];

        // Check user position lock
        if (section.lock?.position && section.lock.lockedBy === "user") {
          return { success: false, error: "POSITION_LOCKED" };
        }

        // Same slot → no-op
        if (section.slot === targetSlot) {
          return { success: true, movedTo: targetSlot, widgetChanged: false };
        }

        // Resolve template
        const templateId = draft.layoutTemplate ?? "monolith";
        const template = getLayoutTemplate(templateId);
        if (!template) {
          return { success: false, error: "NO_TEMPLATE" };
        }

        // Validate target slot exists
        const slot = template.slots.find((s) => s.id === targetSlot);
        if (!slot) {
          return {
            success: false,
            error: "SLOT_NOT_FOUND",
            available: template.slots.map((s) => s.id),
          };
        }

        // Validate slot accepts section type
        if (!slot.accepts.includes(section.type as any)) {
          return {
            success: false,
            error: "TYPE_NOT_ACCEPTED",
            accepted: slot.accepts,
          };
        }

        // Check capacity (exclude the section being moved if it's already in targetSlot)
        const currentInSlot = draft.sections.filter(
          (s) => s.slot === targetSlot && s.id !== sectionId,
        ).length;
        if (slot.maxSections && currentInSlot >= slot.maxSections) {
          return {
            success: false,
            error: "SLOT_FULL",
            current: currentInSlot,
            max: slot.maxSections,
          };
        }

        // Clone section before mutation to avoid modifying the draft reference in-place
        const sectionCopy = { ...section };

        // Auto-switch widget if current doesn't fit target slot size
        const previousWidget = sectionCopy.widgetId;
        let widgetChanged = false;
        if (sectionCopy.widgetId) {
          const currentWidget = getWidgetById(sectionCopy.widgetId);
          if (currentWidget && !currentWidget.fitsIn.includes(slot.size)) {
            const better = getBestWidget(sectionCopy.type as any, slot.size);
            if (better) {
              sectionCopy.widgetId = better.id;
              widgetChanged = true;
            }
          }
        } else {
          // No widget assigned — pick one for the target slot
          const widget = getBestWidget(sectionCopy.type as any, slot.size);
          if (widget) {
            sectionCopy.widgetId = widget.id;
            widgetChanged = true;
          }
        }

        // Apply move
        sectionCopy.slot = targetSlot;
        const updated = { ...draft, sections: [...draft.sections] };
        updated.sections[sectionIdx] = sectionCopy;

        upsertDraft(draft.username ?? "draft", updated, sessionId);

        logEvent({
          eventType: "page_config_updated",
          actor: "assistant",
          payload: { requestId, tool: "move_section", sectionId, targetSlot, widgetChanged },
        });

        return {
          success: true,
          movedTo: targetSlot,
          widgetChanged,
          ...(widgetChanged ? { previousWidget, newWidget: section.widgetId } : {}),
        };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "move_section", error: String(error) },
        });
        return { success: false, error: String(error) };
      }
    },
  }),

  generate_page: tool({
    description:
      "Generate a page from all facts in the knowledge base. Call this when you've gathered enough information and want to build or rebuild the page. The page is generated automatically from stored facts.",
    parameters: z.object({
      username: z
        .string()
        .describe(
          "The username for the page (e.g., 'tommaso'). Use 'draft' during onboarding before the user picks a username.",
        ),
      language: z
        .string()
        .optional()
        .describe(
          "Language code for page content (e.g., 'it', 'en', 'de'). Use the conversation language.",
        ),
    }),
    execute: async ({ username, language }) => {
      try {
        const facts = getActiveFacts(sessionId, readKeys);
        if (facts.length === 0) {
          return { success: false, error: "No facts in knowledge base yet", hint: "Ensure facts exist before generating. Use create_fact first." };
        }
        // Preserve user's style customizations (theme, colors, font) from
        // the existing draft, AND preserve section order/locks from any
        // prior reorder_sections / move_section call.
        // Same pattern as recomposeAfterMutation — delegates to
        // projectCanonicalConfig which handles order, locks, slots, style.
        const currentDraft = getDraft(sessionId);
        // Always compose in the fact language so values and templates are
        // in the same language, then translate the coherent result.
        const targetLang = language ?? sessionLanguage;
        const factLang = getFactLanguage(sessionId) ?? targetLang;

        // Build DraftMeta for order/lock/style preservation (same pattern as recomposeAfterMutation)
        const draftMeta: DraftMeta | undefined = currentDraft
          ? {
              surface: currentDraft.config.surface,
              voice: currentDraft.config.voice,
              light: currentDraft.config.light,
              style: currentDraft.config.style,
              layoutTemplate: currentDraft.config.layoutTemplate,
              sections: currentDraft.config.sections,
            }
          : undefined;

        const styled = projectCanonicalConfig(
          facts,
          username,
          factLang,
          draftMeta,
          effectiveOwnerKey,
        );

        const config = await translatePageContent(styled, targetLang, factLang);

        upsertDraft(username, config, sessionId);
        updateJourneyStatePin(sessionId, "draft_ready");
        logEvent({
          eventType: "page_generated",
          actor: "assistant",
          payload: {
            username,
            factCount: facts.length,
            sectionCount: config.sections.length,
          },
        });

        // Fire-and-forget personalization (steady_state only)
        // Keys: effectiveOwnerKey for all reads (facts/soul/impact), sessionId for metadata writes
        if (mode === "steady_state" && effectiveOwnerKey) {
          const soul = getActiveSoul(effectiveOwnerKey);
          if (soul?.compiled) {
            const publishable = filterPublishableFacts(facts);
            const soulHash = computeHash(soul.compiled);
            const impacted = detectImpactedSections(publishable, effectiveOwnerKey, factLang, soulHash);

            if (impacted.length > 0) {
              // Fire-and-forget: don't await, don't block tool response
              (async () => {
                try {
                  // Circuit B: archetype-weighted personalization priority
                  const meta = getSessionMeta(sessionId);
                  const archetype = typeof meta.archetype === "string" ? meta.archetype : undefined;
                  const impactedSections = impacted
                    .map(type => config.sections.find((s: any) => s.type === type))
                    .filter((s): s is typeof config.sections[number] => !!s);
                  const orderedSections = prioritizeSections(impactedSections, archetype);
                  for (const section of orderedSections) {
                    await personalizeSection({
                      section, ownerKey: effectiveOwnerKey, language: factLang,
                      publishableFacts: publishable,
                      soulCompiled: soul.compiled, username,
                    });
                  }
                } catch (err) {
                  console.error("[generate_page] personalization error:", err);
                }
              })();
            }
          }

          // Fire-and-forget coherence check (steady_state only)
          // Circuit I: pass compiled soul for tone-aware coherence
          // Circuit D1: store warning/info issues in session metadata
          (async () => {
            try {
              const soulCompiled = getActiveSoul(effectiveOwnerKey)?.compiled;
              const issues = await checkPageCoherence(config.sections, facts, soulCompiled);
              const warnings = issues.filter(i => i.severity === "warning");
              const infos = issues.filter(i => i.severity === "info");
              mergeSessionMeta(sessionId, {
                coherenceWarnings: warnings.length > 0 ? warnings : null,
                coherenceInfos: infos.length > 0 ? infos : null,
              });
            } catch (err) {
              console.error("[generate_page] coherence check error:", err);
            }
          })();
        }

        return {
          success: true,
          username,
          sections: config.sections.map((s) => s.type),
          factCount: facts.length,
        };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "generate_page", error: String(error) },
        });
        return { success: false, error: String(error), hint: "Ensure facts exist before generating. Use create_fact first." };
      }
    },
  }),

  request_publish: tool({
    description:
      "Signal that the page is ready for publishing. The user will see a confirmation button. Do NOT use this to publish directly — it only proposes publishing. The current draft (including any theme/order/section changes) is preserved as-is.",
    parameters: z.object({
      username: z
        .string()
        .describe(
          "The username chosen by the user for their public page URL",
        ),
    }),
    execute: async ({ username }) => {
      try {
        const draft = getDraft(sessionId);
        if (!draft) {
          return { success: false, error: "No draft page to publish. Generate a page first." };
        }

        const { effectiveUsername, validation: usernameCheck } =
          await validatePublishUsername(username);
        if (!usernameCheck.ok) {
          return { success: false, error: usernameCheck.message, hint: "The user must register before publishing. Guide them through the signup flow." };
        }

        // Mark the existing draft as pending approval — no recomposition,
        // so manual changes (theme, section order, content edits) are preserved.
        requestPublish(effectiveUsername, sessionId);

        logEvent({
          eventType: "page_publish_requested",
          actor: "assistant",
          payload: {
            username: effectiveUsername,
            sectionCount: draft.config.sections.length,
          },
        });
        return {
          success: true,
          message: "Page is ready for review. The user will see a publish button.",
          username: effectiveUsername,
          sections: draft.config.sections.map((s) => s.type),
        };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "request_publish", error: String(error) },
        });
        return { success: false, error: String(error), hint: "The user must register before publishing. Guide them through the signup flow." };
      }
    },
  }),

  propose_soul_change: tool({
    description:
      "Propose changes to the user's soul profile (voice, tone, values, communication style). Use when you notice consistent patterns in how the user expresses themselves or what they value. The user must approve soul changes before they take effect.",
    parameters: z.object({
      overlay: z
        .record(z.unknown())
        .describe(
          "Soul overlay object with optional fields: voice (string), tone (string), values (string[]), selfDescription (string), communicationStyle (string)",
        ),
      reason: z
        .string()
        .optional()
        .describe("Brief explanation of why this change is proposed"),
    }),
    execute: async ({ overlay, reason }) => {
      try {
        const proposal = proposeSoulChange(
          effectiveOwnerKey,
          overlay as SoulOverlay,
          reason,
        );
        return {
          success: true,
          proposalId: proposal.id,
          message: "Soul change proposed. The user will be able to review and approve it.",
        };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "propose_soul_change", error: String(error) },
        });
        return { success: false, error: String(error) };
      }
    },
  }),

  review_soul_proposal: tool({
    description: "Accept or reject a pending soul change proposal. Use after the user explicitly agrees or disagrees with a proposed soul update you surfaced in chat.",
    parameters: z.object({
      proposalId: z.string().describe("The ID of the soul proposal to review"),
      accept: z.boolean().describe("true to apply the soul change, false to reject it"),
    }),
    execute: async ({ proposalId, accept }) => {
      try {
        const result = reviewProposal(proposalId, effectiveOwnerKey, accept);
        if (!result.success) {
          logEvent({ eventType: "tool_call", actor: "assistant", payload: { requestId, tool: "review_soul_proposal", proposalId, accept, success: false, error: result.error } });
          return { success: false, error: result.error };
        }
        logEvent({ eventType: "tool_call", actor: "assistant", payload: { requestId, tool: "review_soul_proposal", proposalId, accept } });
        return {
          success: true,
          accepted: accept,
          message: accept
            ? "Soul profile updated. Changes will apply from the next conversation."
            : "Proposal rejected. I'll keep the current soul profile.",
        };
      } catch (error) {
        logEvent({ eventType: "tool_call_error", actor: "assistant", payload: { requestId, tool: "review_soul_proposal", error: String(error) } });
        return { success: false, error: String(error) };
      }
    },
  }),

  record_event: tool({
    description: `Record a specific event the user experienced at a point in time.
Use when user describes a past action with a time reference (past-tense verb + when).
Do NOT use create_fact for episodic inputs — use this tool instead.
Use the CURRENT TEMPORAL CONTEXT block from the system prompt to resolve relative dates before calling.

ACTION_TYPE taxonomy (best match at 70%+; else new snake_case type):
workout | meal | social | learning | work | travel | health | milestone | casual

After recording a "milestone" event, ask if user wants it added to their public page.`,
    parameters: z.object({
      actionType: z.string(),
      eventAtHuman: z.string().describe("ISO-8601 datetime"),
      summary: z.string().describe("LLM-curated 1-2 sentences. Not verbatim user text."),
      entities: z.array(z.string()).optional(),
    }),
    execute: async ({ actionType, eventAtHuman, summary, entities }, { messages }) => {
      try {
        const eventAtUnix = Math.floor(new Date(eventAtHuman).getTime() / 1000);
        if (isNaN(eventAtUnix)) return { success: false, error: "Invalid eventAtHuman — must be ISO-8601" };
        const rawInput = extractLatestUserText(messages);
        const eventId = insertEvent({
          ownerKey: effectiveOwnerKey,
          sessionId: eventSessionId,
          sourceMessageId: provenanceMessageId,
          eventAtUnix, eventAtHuman, actionType,
          narrativeSummary: summary, rawInput: rawInput ?? undefined, entities: entities ?? [],
        });
        if (ownerKey) {
          logTrustAction(effectiveOwnerKey, "record_event", `Recorded ${actionType}`, {
            entityId: eventId,
          });
        }
        try { enqueueJob("consolidate_episodes", { ownerKey: effectiveOwnerKey }); }
        catch (err) {
          console.warn("[record_event] enqueueJob unexpected error:", String(err));
        }
        return { success: true, eventId, actionType };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  }),

  recall_episodes: tool({
    description: `Query the user's episodic event log. Returns max 10 events + accurate counts.
When keywords are provided: countsByType is from returned events; totalFound uses FTS count query.
Do NOT call in a loop.`,
    parameters: z.object({
      timeframe: z.enum(["last_7_days", "last_30_days", "last_60_days"]),
      keywords: z.string().optional(),
      actionType: z.string().optional(),
    }),
    execute: async ({ timeframe, keywords, actionType }) => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const days = timeframe === "last_7_days" ? 7 : timeframe === "last_30_days" ? 30 : 60;
        const fromUnix = now - days * 86400;
        const events = queryEvents({ ownerKey: effectiveOwnerKey, fromUnix, toUnix: now, keywords, actionType, limit: 10 });

        let countsByType: Record<string, number>;
        let totalAll: number;

        if (keywords && keywords.trim().length > 0) {
          countsByType = {};
          for (const e of events) countsByType[e.actionType] = (countsByType[e.actionType] ?? 0) + 1;
          const fullCount = countKeywordEvents({
            ownerKey: effectiveOwnerKey, fromUnix, toUnix: now, keywords, actionType,
          });
          totalAll = fullCount > 0 ? fullCount : events.length;
        } else {
          countsByType = countEventsByType(effectiveOwnerKey, fromUnix, now, actionType);
          totalAll = Object.values(countsByType).reduce((a, b) => a + b, 0);
        }

        return {
          success: true, timeframe,
          totalFound: totalAll,
          truncated: totalAll > events.length,
          countsByType,
          events: events.map(e => ({
            id: e.id, actionType: e.actionType,
            eventAtHuman: e.eventAtHuman, narrativeSummary: e.narrativeSummary,
          })),
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  }),

  confirm_episodic_pattern: tool({
    description: `Accept or reject a pending episodic pattern proposal from the Dream Cycle.
	On accept: proposal claim, activity fact write, and draft recomposition stay consistent.`,
    parameters: z.object({
      proposalId: z.string(),
      accept: z.boolean(),
    }),
    execute: async ({ proposalId, accept }) => {
      try {
        const proposal = getEpisodicProposalById(proposalId);
        if (!proposal || proposal.ownerKey !== effectiveOwnerKey) {
          return { success: false, error: "Proposal not found or owner mismatch" };
        }
        if (proposal.status !== "pending") {
          return { success: false, error: "Proposal already resolved" };
        }
        let factId: string | undefined;
        let recomposeOk = true;
        if (accept) {
          const accepted = acceptEpisodicProposalAsActivity(
            proposalId,
            effectiveOwnerKey,
            sessionId,
            effectiveOwnerKey,
          );
          if (!accepted) {
            return { success: false, error: "Proposal not found, already resolved, expired, or owner mismatch" };
          }
          factId = accepted.factId;
          try { recomposeAfterMutation(); } catch { recomposeOk = false; }
        } else {
          const ok = resolveEpisodicProposal(proposalId, effectiveOwnerKey, accept);
          if (!ok) return { success: false, error: "Proposal not found, already resolved, expired, or owner mismatch" };
        }
        if (ownerKey) {
          logTrustAction(
            effectiveOwnerKey,
            "confirm_episodic_pattern",
            accept ? "Accepted" : "Rejected",
            { entityId: proposalId },
          );
        }
        return { success: true, proposalId, accepted: accept, factId, recomposeOk };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  }),

  save_memory: tool({
    description:
      "Save a meta-memory about the user or conversation pattern. Use for observations, preferences, insights, or patterns you notice that aren't individual facts but are useful for future interactions. Examples: 'User prefers concise responses', 'User is excited about AI projects', 'User tends to downplay achievements'.",
    parameters: z.object({
      content: z
        .string()
        .describe("The memory content — a concise observation, preference, or insight"),
      memoryType: z
        .enum(["observation", "preference", "insight", "pattern"])
        .optional()
        .describe("Type of memory: observation (default), preference, insight, or pattern"),
      category: z
        .string()
        .optional()
        .describe("Optional category for grouping (e.g., 'communication', 'interests', 'work')"),
    }),
    execute: async ({ content, memoryType, category }) => {
      try {
        const result = saveMemory(
          effectiveOwnerKey,
          content,
          (memoryType as MemoryType) ?? "observation",
          category,
        );
        if (!result) {
          return { success: false, error: "Memory not saved (duplicate, quota, or cooldown)" };
        }
        return { success: true, memoryId: result.id };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "save_memory", error: String(error) },
        });
        return { success: false, error: String(error) };
      }
    },
  }),

  set_layout: tool({
    description:
      "Change the page layout template. Available: The Monolith, Cinematic, The Curator, The Architect.",
    parameters: z.object({
      username: z.string().describe("The username for the page"),
      layoutTemplate: z
        .string()
        .describe("Layout template: The Monolith, Cinematic, The Curator, The Architect"),
    }),
    execute: async ({ username, layoutTemplate }) => {
      try {
        const resolved = resolveLayoutAlias(layoutTemplate);
        if (!(LAYOUT_TEMPLATES as readonly string[]).includes(resolved)) {
          return { success: false, error: `Invalid layout '${layoutTemplate}'. Valid: ${LAYOUT_TEMPLATES.join(", ")}` };
        }
        const config = ensureDraft();

        const template = getLayoutTemplate(resolved as any);
        const locks = extractLocks(config.sections);
        const draftSlots = new Map<string, string>();
        for (const s of config.sections) {
          if (s.slot) draftSlots.set(s.id, s.slot);
        }
        const { sections, issues } = assignSlotsFromFacts(
          template,
          config.sections,
          locks,
          undefined,
          draftSlots.size > 0 ? draftSlots : undefined,
        );

        const errors = issues.filter(
          (i) => i.severity === "error" && i.issue !== "missing_required",
        );
        if (errors.length > 0) {
          const details = errors.map((e) => `${e.slotId ?? "unknown"}: ${e.message}`).join("; ");
          return {
            success: false,
            error: `Layout change failed: ${details}`,
            issues: errors,
          };
        }

        const updated: PageConfig = {
          ...config,
          layoutTemplate: resolved as any,
          sections,
        };
        upsertDraft(username, updated, sessionId);

        const warnings = issues.filter((i) => i.severity === "warning");
        logEvent({
          eventType: "page_config_updated",
          actor: "assistant",
          payload: { username, change: "layout", layoutTemplate: resolved },
        });
        return { success: true, layoutTemplate: resolved, warnings };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  }),

  propose_lock: tool({
    description:
      "Propose locking a section. The user will see a confirmation prompt. The lock is NOT applied until the user confirms via the UI.",
    parameters: z.object({
      sectionId: z.string().describe("The ID of the section to lock"),
      lockPosition: z
        .boolean()
        .optional()
        .describe("Lock the slot position"),
      lockWidget: z
        .boolean()
        .optional()
        .describe("Lock the widget variant"),
      lockContent: z
        .boolean()
        .optional()
        .describe("Lock the content from being rewritten"),
      reason: z
        .string()
        .describe("Why you're suggesting this lock"),
    }),
    execute: async ({ sectionId, lockPosition, lockWidget, lockContent, reason }) => {
      try {
        const draft = getDraft(sessionId);
        if (!draft) {
          return { success: false, error: "No draft" };
        }

        const sectionIndex = draft.config.sections.findIndex(
          (s) => s.id === sectionId,
        );
        if (sectionIndex === -1) {
          return { success: false, error: "Section not found" };
        }

        // Create a lock proposal (pending), not an actual lock
        const config = { ...draft.config };
        config.sections = config.sections.map((s, i) => {
          if (i === sectionIndex) {
            return {
              ...s,
              lockProposal: {
                position: lockPosition ?? true,
                widget: lockWidget ?? true,
                content: lockContent ?? false,
                proposedBy: "agent" as const,
                proposedAt: new Date().toISOString(),
                reason,
              },
            };
          }
          return s;
        });

        upsertDraft(draft.config.username, config as PageConfig, sessionId);
        return {
          success: true,
          proposed: sectionId,
          status: "pending_user_confirmation",
          reason,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  }),

  resolve_conflict: tool({
    description:
      "Resolve a fact conflict. Use when you detect contradictory information and can propose a resolution. The user can also resolve conflicts via the UI.",
    parameters: z.object({
      conflictId: z.string().describe("The ID of the conflict to resolve"),
      resolution: z
        .enum(["keep_a", "keep_b", "merge"])
        .describe("Resolution: keep_a (keep first fact), keep_b (keep second), merge (combine)"),
      mergedValue: z
        .record(z.unknown())
        .optional()
        .describe("The merged value object (required when resolution is 'merge')"),
    }),
    execute: async ({ conflictId, resolution, mergedValue }) => {
      try {
        const result = resolveConflict(
          conflictId,
          effectiveOwnerKey,
          resolution,
          mergedValue,
        );
        if (!result.success) {
          return { success: false, error: result.error };
        }
        return { success: true, conflictId, resolution };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "resolve_conflict", error: String(error) },
        });
        return { success: false, error: String(error) };
      }
    },
  }),

  set_fact_visibility: tool({
    description:
      "Set the visibility of a fact. As an assistant, you can only set facts to 'proposed' (visible in preview, promoted on publish) or 'private' (hidden from page). You CANNOT set facts to 'public' — only the user can do that by publishing.",
    parameters: z.object({
      factId: z.string().describe("The ID of the fact to change visibility for"),
      visibility: z
        .enum(["proposed", "private"])
        .describe("Target visibility: 'proposed' (page-visible) or 'private' (hidden)"),
    }),
    execute: async ({ factId, visibility }) => {
      try {
        const fact = setFactVisibility(factId, visibility, "assistant", sessionId, readKeys);
        try { recomposeAfterMutation(); } catch (e) {
          logEvent({ eventType: "recompose_error", actor: "system", payload: { requestId, error: String(e), source: "visibility_change" } });
        }
        return {
          success: true,
          factId: fact.id,
          visibility: fact.visibility,
        };
      } catch (error) {
        if (error instanceof VisibilityTransitionError) {
          return { success: false, error: error.message, code: "VISIBILITY_TRANSITION_BLOCKED" };
        }
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "set_fact_visibility", error: String(error), factId },
        });
        return { success: false, error: String(error) };
      }
    },
  }),

  publish_preflight: tool({
    description:
      "Check if the page is ready to publish. Returns gate checks (blocking) and quality checks (advisory). Call this before request_publish to give the user useful feedback.",
    parameters: z.object({
      username: z
        .string()
        .describe("The username to check publish readiness for"),
    }),
    execute: async ({ username }) => {
      try {
        // 1. Draft check
        const draft = getDraft(sessionId);
        if (!draft) {
          return {
            readyToPublish: false,
            summary: "No draft found. Generate a page first.",
            gates: { hasDraft: false, hasAuth: false, hasUsername: false, hasValidLayout: false },
            quality: { incompleteSections: [] as string[], proposedFacts: 0, thinSections: [] as string[], missingContact: true, layoutIssues: [] as string[] },
            info: { sectionCount: 0, factCount: 0 },
          };
        }

        // 2. Gate checks
        const multiUser = isMultiUserEnabled();
        const hasAuth = !multiUser || publishAuth.authenticated;
        const {
          validation: usernameValidation,
          effectiveUsername,
        } = await validatePublishUsername(username);
        const hasUsername = usernameValidation.ok;

        // 3. Quality checks
        const allFacts = getActiveFacts(sessionId, readKeys);
        const publishableFacts = filterPublishableFacts(allFacts);
        const proposedCount = allFacts.filter((f: any) => f.visibility === "proposed").length;

        // Section completeness
        const config = draft.config;
        const incompleteSections = config.sections
          .filter((s: any) => !isSectionComplete(s))
          .map((s: any) => s.type);
        const layoutReadiness = evaluateLayoutPublishability(config);

        // Thin sections from richness
        const thinSections = Object.keys(SECTION_FACT_CATEGORIES)
          .filter((type) => classifySectionRichness(publishableFacts, type) === "thin");

        // Missing contact
        const hasContact = allFacts.some(
          (f: any) => f.category === "contact" && f.visibility !== "private",
        );

        const gates = {
          hasDraft: true,
          hasAuth,
          hasUsername,
          hasValidLayout: layoutReadiness.valid,
        };
        const readyToPublish = Object.values(gates).every(Boolean);
        const gateFailures = Object.entries(gates)
          .filter(([, value]) => !value)
          .map(([key]) => key);

        return {
          readyToPublish,
          gates,
          quality: {
            incompleteSections,
            proposedFacts: proposedCount,
            thinSections,
            missingContact: !hasContact,
            layoutIssues: layoutReadiness.issues,
          },
          info: {
            sectionCount: config.sections.length,
            factCount: allFacts.length,
          },
          username: effectiveUsername,
          ...(!hasUsername && !usernameValidation.ok ? { usernameIssue: usernameValidation.message } : {}),
          summary: readyToPublish
            ? `Page ready to publish with ${config.sections.length} sections.`
            : `Cannot publish: ${gateFailures.join(", ")}.${!hasUsername && usernameValidation.message ? ` Username: ${usernameValidation.message}` : ""}${!layoutReadiness.valid && layoutReadiness.issues.length > 0 ? ` Layout: ${layoutReadiness.issues.slice(0, 2).join("; ")}` : ""}`,
        };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "publish_preflight", error: String(error) },
        });
        return {
          readyToPublish: false,
          summary: `Preflight error: ${String(error)}`,
          gates: { hasDraft: false, hasAuth: false, hasUsername: false, hasValidLayout: false },
          quality: { incompleteSections: [] as string[], proposedFacts: 0, thinSections: [] as string[], missingContact: true, layoutIssues: [] as string[] },
          info: { sectionCount: 0, factCount: 0 },
        };
      }
    },
  }),

  archive_fact: tool({
    description:
      "Soft-delete a fact by setting archived_at. The fact disappears from the page but can be restored with unarchive_fact. Use instead of delete_fact when the user might want to bring it back later.",
    parameters: z.object({
      factId: z.string().describe("The ID of the fact to archive"),
    }),
    execute: async ({ factId }) => {
      try {
        const existing = getFactById(factId, sessionId, readKeys);
        if (!existing) return { success: false, error: "FACT_NOT_FOUND" };
        if (existing.archivedAt) return { success: true, factId, alreadyArchived: true };
        const now = new Date().toISOString();
        db.update(facts).set({ archivedAt: now, updatedAt: now }).where(eq(facts.id, factId)).run();
        // Orphan children
        db.update(facts).set({ parentFactId: null }).where(eq(facts.parentFactId, factId)).run();
        logTrustAction(effectiveOwnerKey, "archive_fact", `Archived fact ${factId}`, {
          undoPayload: { action: "unarchive_fact", factId },
        });
        let recomposeOk = true;
        try { recomposeAfterMutation(); } catch (e) {
          recomposeOk = false;
          logEvent({ eventType: "recompose_error", actor: "system", payload: { requestId, error: String(e) } });
        }
        return { success: true, factId, recomposeOk };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "archive_fact", error: String(error), factId },
        });
        return { success: false, error: String(error) };
      }
    },
  }),

  unarchive_fact: tool({
    description:
      "Restore a previously archived fact by clearing archived_at. The fact reappears on the page.",
    parameters: z.object({
      factId: z.string().describe("The ID of the archived fact to restore"),
    }),
    execute: async ({ factId }) => {
      try {
        const existing = getFactById(factId, sessionId, readKeys);
        if (!existing) return { success: false, error: "FACT_NOT_FOUND" };
        if (!existing.archivedAt) return { success: true, factId, alreadyActive: true };
        const now = new Date().toISOString();
        db.update(facts).set({ archivedAt: null, updatedAt: now }).where(eq(facts.id, factId)).run();
        let recomposeOk = true;
        try { recomposeAfterMutation(); } catch (e) {
          recomposeOk = false;
          logEvent({ eventType: "recompose_error", actor: "system", payload: { requestId, error: String(e) } });
        }
        return { success: true, factId, recomposeOk };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "unarchive_fact", error: String(error), factId },
        });
        return { success: false, error: String(error) };
      }
    },
  }),

  reorder_items: tool({
    description:
      "Reorder items within a section by setting sort_order on each fact. Provide fact IDs (not keys) in the desired order. Cannot reorder composite sections (hero, bio, at-a-glance, footer).",
    parameters: z.object({
      factIds: z
        .array(z.string())
        .describe("Array of fact IDs in the desired display order"),
    }),
    execute: async ({ factIds }) => {
      try {
        if (factIds.length === 0) return { success: true, reordered: 0 };
        // Validate all facts exist, are active, and share a category
        // Categories whose facts feed composite sections (hero/bio/at-a-glance/footer)
        // that have no meaningful item order
        const NON_REORDERABLE_CATEGORIES = new Set(["identity"]);
        const resolved: Array<{ id: string; category: string }> = [];
        for (const fid of factIds) {
          const f = getFactById(fid, sessionId, readKeys);
          if (!f) return { success: false, error: `Fact not found: ${fid}` };
          resolved.push({ id: f.id, category: f.category });
        }
        const categories = new Set(resolved.map(r => r.category));
        if (categories.size > 1) {
          return { success: false, error: `All facts must share a category. Found: ${[...categories].join(", ")}` };
        }
        const category = resolved[0].category;
        if (NON_REORDERABLE_CATEGORIES.has(category)) {
          return { success: false, error: `Cannot reorder items in composite section '${category}'` };
        }
        // Write dense ranks
        const now = new Date().toISOString();
        for (let i = 0; i < resolved.length; i++) {
          db.update(facts).set({ sortOrder: i, updatedAt: now }).where(eq(facts.id, resolved[i].id)).run();
        }
        let recomposeOk = true;
        try { recomposeAfterMutation(); } catch (e) {
          recomposeOk = false;
          logEvent({ eventType: "recompose_error", actor: "system", payload: { requestId, error: String(e) } });
        }
        return { success: true, reordered: resolved.length, category, recomposeOk };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "reorder_items", error: String(error) },
        });
        return { success: false, error: String(error) };
      }
    },
  }),

  inspect_page_state: tool({
    description:
      "Get a structured view of the current page state including layout, sections, slot assignments, and warnings. Use this to understand what the page looks like before making changes.",
    parameters: z.object({}),
    execute: async () => {
      const emptyResult = (error: string) => ({
        error,
        layout: { template: "unknown", theme: "unknown", style: {} },
        sections: [] as { id: string; type: string; slot: string; widget: string; locked: boolean; complete: boolean; richness: string }[],
        availableSlots: [] as string[],
        warnings: [] as string[],
      });

      try {
        const draft = getDraft(sessionId);
        if (!draft) return emptyResult("No draft found");

        const config = draft.config;
        const template = resolveLayoutTemplate(config);
        const slotGroups = groupSectionsBySlot(config.sections, template);
        const allFacts = getActiveFacts(sessionId, readKeys);
        const publishable = filterPublishableFacts(allFacts);

        const sections = config.sections.map((s) => {
          let slot = "unknown";
          for (const [slotId, slotSections] of Object.entries(slotGroups)) {
            if (Array.isArray(slotSections) && slotSections.some((ss) => ss.id === s.id)) {
              slot = slotId;
              break;
            }
          }
          return {
            id: s.id,
            type: s.type,
            slot,
            widget: s.widgetId ?? "default",
            locked: !!s.lock,
            complete: isSectionComplete(s),
            richness: classifySectionRichness(publishable, s.type),
          };
        });

        const warnings: string[] = [];
        sections
          .filter((s) => s.richness === "thin")
          .forEach((s) => warnings.push(`${s.type} section is thin`));
        sections
          .filter((s) => !s.complete)
          .forEach((s) => warnings.push(`${s.type} section is incomplete`));
        if (
          !allFacts.some(
            (f: any) => f.category === "contact" && f.visibility !== "private",
          )
        ) {
          warnings.push("No public contact information");
        }

        return {
          layout: {
            template: config.layoutTemplate ?? "monolith",
            surface: config.surface,
            voice: config.voice,
            light: config.light,
            style: config.style ?? {},
          },
          sections,
          availableSlots: template.slots.map((s: any) => s.id),
          warnings,
        };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "inspect_page_state", error: String(error) },
        });
        return emptyResult(String(error));
      }
    },
  }),
  curate_content: tool({
    description:
      "Curate the display text of page content without modifying facts. " +
      "Use for capitalization fixes, wording improvements, tone adjustments, and professional polish. " +
      "If factId is provided, curates a specific item (e.g., project title). " +
      "If factId is omitted, curates the section-level description (e.g., bio text). " +
      "The underlying facts remain unchanged — this only affects presentation.",
    parameters: z.object({
      sectionType: z
        .string()
        .describe("Section type to curate (e.g., 'projects', 'bio', 'experience')"),
      factId: z
        .string()
        .optional()
        .describe(
          "Fact UUID for item-level curation (e.g., a specific project). " +
          "Omit for section-level curation (e.g., bio description).",
        ),
      fields: z
        .record(z.string())
        .describe(
          "Fields to override. Only text fields allowed (no dates, URLs, or structural data). " +
          "Example: { title: 'OpenSelf', description: 'AI-powered page builder' }",
        ),
    }),
    execute: async ({ sectionType, factId, fields }) => {
      if (factId) {
        // --- ITEM-LEVEL: route to fact_display_overrides ---
        const allFacts = getActiveFacts(sessionId, readKeys);
        const fact = allFacts.find((f: { id: string }) => f.id === factId);
        if (!fact) {
          return { success: false, error: `Fact ${factId} not found` };
        }

        // Filter to editable fields only
        const editableFields = filterEditableFields(fact.category, fields);
        if (Object.keys(editableFields).length === 0) {
          return {
            success: false,
            error: `No editable fields for category '${fact.category}'. Editable: ${ITEM_EDITABLE_FIELDS[fact.category]?.join(", ") ?? "none"}`,
          };
        }

        const service = getFactDisplayOverrideService();
        service.upsertOverride({
          ownerKey: effectiveOwnerKey,
          factId,
          displayFields: editableFields,
          factValueHash: computeFactValueHash(fact.value),
          source: "agent",
        });

        // Trigger recomposition so preview updates
        recomposeAfterMutation();

        return {
          success: true,
          level: "item",
          factId,
          category: fact.category,
          appliedFields: editableFields,
        };
      } else {
        // --- SECTION-LEVEL: route to section_copy_state ---
        const allowed = PERSONALIZABLE_FIELDS[sectionType];
        if (!allowed) {
          return { success: false, error: `Section '${sectionType}' does not support curation` };
        }

        // Filter to allowed fields
        const filteredFields: Record<string, string> = {};
        for (const key of Object.keys(fields)) {
          if (allowed.includes(key)) filteredFields[key] = fields[key];
        }
        if (Object.keys(filteredFields).length === 0) {
          return {
            success: false,
            error: `No editable fields for section '${sectionType}'. Allowed: ${allowed.join(", ")}`,
          };
        }

        const allFacts = getActiveFacts(sessionId, readKeys);
        const factsHash = computeSectionFactsHash(allFacts, sectionType);
        const soul = getActiveSoul(effectiveOwnerKey);
        const soulHash = computeHash(soul?.compiled ?? "");

        upsertCopyState({
          ownerKey: effectiveOwnerKey,
          sectionType,
          language: sessionLanguage,
          personalizedContent: JSON.stringify(filteredFields),
          factsHash,
          soulHash,
          source: "agent",
        });

        // Trigger recomposition
        recomposeAfterMutation();

        return {
          success: true,
          level: "section",
          sectionType,
          appliedFields: filteredFields,
        };
      }
    },
  }),
  };

  // --- Journal recording wrapper ---
  // Wraps each tool's execute to record journal entries for every call.
  function summarizeArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    const { value, operations, ...light } = args;
    if (operations && Array.isArray(operations)) return { ...light, batchSize: operations.length };
    return light;
  }
  function summarizeTool(toolName: string, args: Record<string, unknown>, result: unknown): string {
    const r = result as Record<string, unknown> | null;
    switch (toolName) {
      case "create_fact": return `${args.category}/${args.key}`;
      case "delete_fact": return `deleted ${args.factId}`;
      case "search_facts": return `searched "${args.query}" (${r?.count ?? 0} results)`;
      case "batch_facts": return `batch ${(args.operations as unknown[])?.length ?? 0} ops`;
      case "generate_page": return "composed page";
      case "update_page_style": return `presence surface=${args.surface ?? "-"} voice=${args.voice ?? "-"} light=${args.light ?? "-"}`;
      case "set_layout": return `layout=${args.layout}`;
      case "reorder_sections": return "reordered sections";
      case "move_section": return `moved ${args.sectionId} → ${args.targetSlot}`;
      case "request_publish": return `publish ${args.username}`;
      case "record_event": return `event ${args.actionType}`;
      case "recall_episodes": return `recall ${args.timeframe}${args.keywords ? ` "${args.keywords}"` : ""}`;
      case "confirm_episodic_pattern": return `${args.accept ? "accepted" : "rejected"} pattern ${args.proposalId}`;
      case "curate_content": return `curate ${args.sectionType}${args.factId ? ` item ${args.factId}` : ""}`;
      default: return toolName;
    }
  }
  for (const [name, t] of Object.entries(tools)) {
    const originalExecute = (t as { execute: Function }).execute;
    (t as { execute: Function }).execute = async function (this: unknown, args: Record<string, unknown>, context: unknown) {
      const start = Date.now();
      try {
        const result = await originalExecute.call(this, args, context);
        operationJournal.push({
          toolName: name,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - start,
          success: typeof result === "object" && result !== null ? (result as Record<string, unknown>).success !== false : true,
          args: summarizeArgs(name, args),
          summary: summarizeTool(name, args, result),
          ...(name === "batch_facts" && args.operations ? { batchSize: (args.operations as unknown[]).length } : {}),
        });
        return result;
      } catch (error) {
        operationJournal.push({
          toolName: name,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - start,
          success: false,
          args: summarizeArgs(name, args),
          summary: `${name} failed: ${(error as Error).message ?? String(error)}`,
        });
        throw error;
      }
    };
  }

  return { tools, getJournal: () => operationJournal };
}

/**
 * Merge locks from existing sections onto incoming sections (match by id).
 * Preserves user locks that the agent shouldn't overwrite.
 */
function mergeSectionLocks(
  incoming: PageConfig["sections"],
  existing: PageConfig["sections"],
): PageConfig["sections"] {
  const lockMap = new Map<string, { lock?: PageConfig["sections"][0]["lock"]; lockProposal?: PageConfig["sections"][0]["lockProposal"] }>();
  for (const s of existing) {
    if (s.lock || s.lockProposal) {
      lockMap.set(s.id, { lock: s.lock, lockProposal: s.lockProposal });
    }
  }
  return incoming.map((s) => {
    const locks = lockMap.get(s.id);
    if (locks) {
      return { ...s, ...locks };
    }
    return s;
  });
}

// Backward compatibility for tests/imports that expect a static object.
export const agentTools = createAgentTools("en", "__default__").tools;
