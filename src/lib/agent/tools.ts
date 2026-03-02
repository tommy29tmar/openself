import { tool } from "ai";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  createFact,
  updateFact,
  deleteFact,
  searchFacts,
  getActiveFacts,
  getFactById,
  setFactVisibility,
  VisibilityTransitionError,
  factExistsAcrossReadKeys,
} from "@/lib/services/kb-service";
import { db } from "@/lib/db";
import { facts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { FactConstraintError } from "@/lib/services/fact-constraints";
import { logTrustAction } from "@/lib/services/trust-ledger-service";
import { getDraft, upsertDraft, requestPublish, computeConfigHash } from "@/lib/services/page-service";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { type PageConfig, AVAILABLE_THEMES } from "@/lib/page-config/schema";
import { logEvent } from "@/lib/services/event-service";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { translatePageContent } from "@/lib/ai/translate";
import { saveMemory, type MemoryType } from "@/lib/services/memory-service";
import { proposeSoulChange, getActiveSoul, type SoulOverlay } from "@/lib/services/soul-service";
import { resolveConflict } from "@/lib/services/conflict-service";
import { FactValidationError } from "@/lib/services/fact-validation";
import { LAYOUT_TEMPLATES, resolveLayoutAlias } from "@/lib/layout/contracts";
import { getLayoutTemplate, resolveLayoutTemplate } from "@/lib/layout/registry";
import { assignSlotsFromFacts } from "@/lib/layout/assign-slots";
import { extractLocks } from "@/lib/layout/lock-policy";
import { groupSectionsBySlot } from "@/lib/layout/group-slots";
import { toSlotAssignments } from "@/lib/layout/validate-adapter";
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

export function createAgentTools(sessionLanguage: string = "en", sessionId: string = "__default__", ownerKey?: string, requestId?: string, readKeys?: string[], mode?: string) {
  const effectiveOwnerKey = ownerKey ?? sessionId;
  const operationJournal: JournalEntry[] = [];

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
    return { requiresConfirmation: true, message: `Changing identity/${key} requires explicit user confirmation. Ask the user to confirm in their next message.` };
  }

  /**
   * Bulk delete gate. Returns null if allowed, or a message object if blocked.
   */
  function deleteGate(factId: string): { requiresConfirmation: true; message: string } | null {
    if (_deleteBlockedThisTurn) {
      return { requiresConfirmation: true, message: "Further deletions blocked this turn — wait for user confirmation in a new message." };
    }

    // Check pending (confirmed delete from previous turn)
    const matchIdx = pendings.findIndex(p => p.type === "bulk_delete" && p.factIds?.includes(factId));
    if (matchIdx >= 0) {
      pendings.splice(matchIdx, 1);
      mergeSessionMeta(sessionId, { pendingConfirmations: pendings.length ? pendings : null });
      _deletionCountThisTurn++; // count it, so 2nd+ delete in same turn still blocks
      return null; // allowed
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

    _deletionCountThisTurn++;
    return null; // first delete — allowed
  }

  /** Auto-compose draft from facts if none exists yet. */
  function ensureDraft(): PageConfig {
    const existing = getDraft(sessionId);
    if (existing) return existing.config;
    const allFacts = getActiveFacts(sessionId, readKeys);
    if (allFacts.length === 0) throw new Error("No facts yet — ask the user for information first");
    const factLang = getFactLanguage(sessionId) ?? sessionLanguage;
    const composed = composeOptimisticPage(allFacts, "draft", factLang);
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
            theme: currentDraft.config.theme,
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
        .record(z.unknown())
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
        // Identity overwrite gate
        const blocked = identityGate(category, key, value);
        if (blocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...blocked };

        const fact = await createFact({
          category,
          key,
          value,
          confidence,
        }, sessionId);
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
    description: "Execute multiple fact operations in order. Operations are applied sequentially (create, update, delete) and a single recompose runs at the end. Max 20 operations.",
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
          action: z.literal("update"),
          factId: z.string(),
          value: z.record(z.unknown()),
        }),
        z.object({
          action: z.literal("delete"),
          factId: z.string(),
        }),
      ])).max(20),
    }),
    execute: async ({ operations }) => {
      if (operations.length > 20) {
        return { success: false, error: "MAX_BATCH_SIZE", message: "Maximum 20 operations per batch", created: 0, updated: 0, deleted: 0 };
      }

      // Pre-flight: batch with ≥2 deletes → all blocked (zero execute)
      const deleteOps = operations.filter(op => op.action === "delete");
      if (deleteOps.length >= 2) {
        const factIds = deleteOps.map(op => (op as { factId: string }).factId);
        _deleteBlockedThisTurn = true;
        pendings.push({
          id: randomUUID(),
          type: "bulk_delete",
          factIds,
          createdAt: new Date().toISOString(),
        });
        mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
        return { success: false, code: "REQUIRES_CONFIRMATION", requiresConfirmation: true, message: "Batch with 2+ deletions requires explicit user confirmation. List the items and ask the user to confirm.", created: 0, updated: 0, deleted: 0 };
      }

      // Pre-flight: identity overwrites
      for (const op of operations) {
        if (op.action === "create" && op.category === "identity") {
          const blocked = identityGate(op.category, op.key, op.value);
          if (blocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...blocked, created: 0, updated: 0, deleted: 0 };
        }
        if (op.action === "update") {
          const existing = getFactById(op.factId, sessionId, readKeys);
          if (existing?.category === "identity") {
            const blocked = identityGate(existing.category, existing.key, op.value, op.factId);
            if (blocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...blocked, created: 0, updated: 0, deleted: 0 };
          }
        }
      }

      let created = 0, updated = 0, deleted = 0;
      const warnings: string[] = [];
      const reverseOps: Array<{
        action: "delete" | "restore" | "recreate";
        factId?: string;
        previousValue?: unknown;
        previousFact?: Record<string, unknown>;
      }> = [];

      try {
        for (const op of operations) {
          switch (op.action) {
            case "create": {
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
            case "update": {
              const old = getFactById(op.factId, sessionId, readKeys);
              if (old) reverseOps.push({ action: "restore", factId: op.factId, previousValue: old.value });
              const updatedRow = updateFact({ factId: op.factId, value: op.value }, sessionId, readKeys);
              if (updatedRow) {
                updated++;
                const w = (updatedRow as any)._warnings as string[] | undefined;
                if (w) warnings.push(...w);
              }
              break;
            }
            case "delete": {
              // Single delete within batch — apply delete gate
              const dBlocked = deleteGate(op.factId);
              if (dBlocked) {
                warnings.push(`Delete of ${op.factId} blocked: ${dBlocked.message}`);
                break;
              }
              const old = getFactById(op.factId, sessionId, readKeys);
              if (old) {
                const { id, ...rest } = old;
                reverseOps.push({ action: "recreate", factId: id, previousFact: rest as Record<string, unknown> });
              }
              const didDelete = deleteFact(op.factId, sessionId, readKeys);
              if (didDelete) deleted++;
              break;
            }
          }
        }

        if (reverseOps.length > 0) {
          logTrustAction(effectiveOwnerKey, "batch_facts",
            `Batch: ${created} created, ${updated} updated, ${deleted} deleted`,
            { undoPayload: { action: "reverse_batch", reverseOps } },
          );
        }
        try { recomposeAfterMutation(); } catch (e) {
          logEvent({ eventType: "recompose_error", actor: "system", payload: { requestId, error: String(e), source: "batch_facts" } });
        }
        return { success: true, created, updated, deleted, ...(warnings.length > 0 ? { warnings } : {}) };
      } catch (err) {
        if (reverseOps.length > 0) {
          try {
            logTrustAction(effectiveOwnerKey, "batch_facts",
              `Batch (partial): ${created} created, ${updated} updated, ${deleted} deleted — stopped by error`,
              { undoPayload: { action: "reverse_batch", reverseOps } },
            );
            recomposeAfterMutation();
          } catch (cleanupErr) {
            console.error("[batch_facts] cleanup failed after partial batch:", cleanupErr);
          }
        }

        if (err instanceof FactValidationError) {
          return { success: false, error: "VALIDATION_ERROR", message: err.message, created, updated, deleted, hint: "Batch stopped — earlier operations were applied" };
        }
        if (err instanceof FactConstraintError) {
          return { success: false, code: err.code, existingFactId: err.existingFactId, suggestion: err.suggestion, created, updated, deleted, hint: "Batch stopped — earlier operations were applied" };
        }
        throw err;
      }
    },
  }),

  update_fact: tool({
    description:
      "Update an existing fact's value. Use when information changes (e.g., user left a job, changed location). ALWAYS provide the FULL new value object — partial updates are not supported. Example: update_fact({factId: 'abc-123', value: {role: 'senior economist', company: 'CDP', status: 'current'}})",
    parameters: z.object({
      factId: z.string().describe("The ID of the fact to update (from KNOWN FACTS or search_facts results)"),
      value: z
        .record(z.unknown())
        .describe("REQUIRED. The complete new value object that replaces the old one. Must include all fields, not just changed ones."),
    }),
    execute: async ({ factId, value }) => {
      try {
        // Identity overwrite gate — look up existing fact for category/key
        const existing = getFactById(factId, sessionId, readKeys);
        if (existing) {
          const blocked = identityGate(existing.category, existing.key, value, factId);
          if (blocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...blocked };
        }

        const fact = updateFact({ factId, value }, sessionId, readKeys);
        if (!fact) return { success: false, error: "Fact not found" };
        let recomposeOk = true;
        try { recomposeAfterMutation(); } catch (e) {
          recomposeOk = false;
          logEvent({ eventType: "recompose_error", actor: "system", payload: { requestId, error: String(e) } });
        }
        const warnings = (fact as any)._warnings as string[] | undefined;
        return {
          success: true,
          factId: fact.id,
          visibility: fact.visibility,
          pageVisible: fact.visibility === "public" || fact.visibility === "proposed",
          recomposeOk,
          ...(warnings ? { warnings } : {}),
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
          payload: { requestId, tool: "update_fact", error: String(error), factId },
        });
        return { success: false, error: String(error) };
      }
    },
  }),

  delete_fact: tool({
    description:
      "Delete a fact from the knowledge base. Only use when the user explicitly asks to remove something.",
    parameters: z.object({
      factId: z.string().describe("The ID of the fact to delete"),
    }),
    execute: async ({ factId }) => {
      try {
        // Bulk delete gate
        const blocked = deleteGate(factId);
        if (blocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...blocked };

        const deleted = deleteFact(factId, sessionId, readKeys);
        let recomposeOk = true;
        if (deleted) {
          try { recomposeAfterMutation(); } catch (e) {
            recomposeOk = false;
            logEvent({ eventType: "recompose_error", actor: "system", payload: { requestId, error: String(e) } });
          }
        }
        return { success: deleted, recomposeOk };
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
        return {
          success: true,
          count: results.length,
          facts: results.map((f) => ({
            id: f.id,
            category: f.category,
            key: f.key,
            value: f.value,
            confidence: f.confidence,
          })),
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  }),

  update_page_style: tool({
    description:
      "Update the page style metadata (theme, colors, font, layout). Does NOT modify section content — use generate_page for that. Pages are composed from facts, not from direct config edits.",
    parameters: z.object({
      username: z.string().describe("The username for the page"),
      theme: z.string().optional().describe(`Theme name: ${AVAILABLE_THEMES.join(" or ")}`),
      style: z.record(z.unknown()).optional().describe("Style object with colorScheme, primaryColor, fontFamily, layout"),
      layoutTemplate: z.string().optional().describe("Layout template: monolith, cinematic, curator, or architect"),
    }),
    execute: async ({ username, theme, style, layoutTemplate }) => {
      try {
        const config = ensureDraft();
        const updated: PageConfig = { ...config };

        if (theme !== undefined) {
          if (!(AVAILABLE_THEMES as readonly string[]).includes(theme)) {
            return { success: false, error: `Unknown theme. Available: ${AVAILABLE_THEMES.join(", ")}` };
          }
          updated.theme = theme;
        }

        if (style !== undefined) {
          updated.style = { ...config.style, ...style } as PageConfig["style"];
        }

        if (layoutTemplate !== undefined) {
          updated.layoutTemplate = layoutTemplate as PageConfig["layoutTemplate"];
        }

        upsertDraft(username, updated, sessionId);
        logEvent({
          eventType: "page_config_updated",
          actor: "assistant",
          payload: { username, change: "style", theme, layoutTemplate },
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
        return { success: false, error: String(error) };
      }
    },
  }),

  set_theme: tool({
    description:
      `Change the page theme. Available themes: ${AVAILABLE_THEMES.join(", ")}.`,
    parameters: z.object({
      username: z.string().describe("The username for the page"),
      theme: z
        .string()
        .describe(`Theme name: ${AVAILABLE_THEMES.join(" or ")}`),
    }),
    execute: async ({ username, theme }) => {
      try {
        if (!(AVAILABLE_THEMES as readonly string[]).includes(theme)) {
          return { success: false, error: `Unknown theme. Available: ${AVAILABLE_THEMES.join(", ")}` };
        }
        const config = ensureDraft();
        const updated: PageConfig = { ...config, theme };
        upsertDraft(username, updated, sessionId);
        logEvent({
          eventType: "page_config_updated",
          actor: "assistant",
          payload: { username, change: "theme", theme },
        });
        return { success: true, theme };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "set_theme", error: String(error), username, theme },
        });
        return { success: false, error: String(error) };
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
          return { success: false, error: "No facts in knowledge base yet" };
        }
        // Preserve user's style customizations (theme, colors, font) from
        // the existing draft. composeOptimisticPage always uses defaults.
        const currentDraft = getDraft(sessionId);
        // Always compose in the fact language so values and templates are
        // in the same language, then translate the coherent result.
        const targetLang = language ?? sessionLanguage;
        const factLang = getFactLanguage(sessionId) ?? targetLang;
        const existingTemplate = currentDraft?.config.layoutTemplate;
        const composed = composeOptimisticPage(
          facts,
          username,
          factLang,
          existingTemplate,
        );
        let styled: PageConfig = currentDraft
          ? { ...composed, theme: currentDraft.config.theme, style: currentDraft.config.style }
          : composed;
        // Preserve layoutTemplate and re-assign slots with locks
        if (existingTemplate && currentDraft) {
          styled.layoutTemplate = existingTemplate;
          const template = getLayoutTemplate(existingTemplate);
          const locks = extractLocks(currentDraft.config.sections);
          const { sections } = assignSlotsFromFacts(template, styled.sections, locks);
          styled = { ...styled, sections };
        }

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
        return { success: false, error: String(error) };
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

        // Username format validation (belt-and-suspenders with publish_preflight)
        if (!username || username.length === 0) {
          return { success: false, error: "Username is required for publishing." };
        }
        const usernameCheck = validateUsernameFormat(username);
        if (!usernameCheck.ok) {
          return { success: false, error: usernameCheck.message };
        }

        // Mark the existing draft as pending approval — no recomposition,
        // so manual changes (theme, section order, content edits) are preserved.
        requestPublish(username, sessionId);
        updateJourneyStatePin(sessionId, "active_fresh");

        logEvent({
          eventType: "page_publish_requested",
          actor: "assistant",
          payload: {
            username,
            sectionCount: draft.config.sections.length,
          },
        });
        return {
          success: true,
          message: "Page is ready for review. The user will see a publish button.",
          username,
          sections: draft.config.sections.map((s) => s.type),
        };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "request_publish", error: String(error) },
        });
        return { success: false, error: String(error) };
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
      "Change the page layout template. Available: monolith, cinematic, curator, architect.",
    parameters: z.object({
      username: z.string().describe("The username for the page"),
      layoutTemplate: z
        .string()
        .describe("Layout template: monolith, cinematic, curator, architect"),
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
        const { sections, issues } = assignSlotsFromFacts(
          template,
          config.sections,
          locks,
        );

        const errors = issues.filter((i) => i.severity === "error");
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
            gates: { hasDraft: false, hasAuth: false, hasUsername: false },
            quality: { incompleteSections: [] as string[], proposedFacts: 0, thinSections: [] as string[], missingContact: true },
            info: { sectionCount: 0, factCount: 0 },
          };
        }

        // 2. Gate checks
        const multiUser = isMultiUserEnabled();
        const hasAuth = !multiUser || !!ownerKey;
        const usernameValidation = username.length > 0 ? validateUsernameFormat(username) : { ok: false, message: "Username is required" };
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

        // Thin sections from richness
        const thinSections = Object.keys(SECTION_FACT_CATEGORIES)
          .filter((type) => classifySectionRichness(publishableFacts, type) === "thin");

        // Missing contact
        const hasContact = allFacts.some(
          (f: any) => f.category === "contact" && f.visibility !== "private",
        );

        const gates = { hasDraft: true, hasAuth, hasUsername };
        const readyToPublish = Object.values(gates).every(Boolean);

        return {
          readyToPublish,
          gates,
          quality: {
            incompleteSections,
            proposedFacts: proposedCount,
            thinSections,
            missingContact: !hasContact,
          },
          info: {
            sectionCount: config.sections.length,
            factCount: allFacts.length,
          },
          ...(!hasUsername && !usernameValidation.ok ? { usernameIssue: usernameValidation.message } : {}),
          summary: readyToPublish
            ? `Page ready to publish with ${config.sections.length} sections.`
            : `Cannot publish: ${Object.entries(gates).filter(([, v]) => !v).map(([k]) => k).join(", ")}.${!hasUsername && usernameValidation.message ? ` Username: ${usernameValidation.message}` : ""}`,
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
          gates: { hasDraft: false, hasAuth: false, hasUsername: false },
          quality: { incompleteSections: [] as string[], proposedFacts: 0, thinSections: [] as string[], missingContact: true },
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
            theme: config.theme ?? "minimal",
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
      case "update_fact": return `updated ${args.factId}`;
      case "delete_fact": return `deleted ${args.factId}`;
      case "search_facts": return `searched "${args.query}" (${r?.count ?? 0} results)`;
      case "batch_facts": return `batch ${(args.operations as unknown[])?.length ?? 0} ops`;
      case "generate_page": return "composed page";
      case "set_theme": return `theme=${args.theme}`;
      case "set_layout": return `layout=${args.layout}`;
      case "reorder_sections": return "reordered sections";
      case "move_section": return `moved ${args.sectionId} → ${args.targetSlot}`;
      case "request_publish": return `publish ${args.username}`;
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
