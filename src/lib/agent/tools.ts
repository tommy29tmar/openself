import { tool } from "ai";
import { z } from "zod";
import {
  createFact,
  updateFact,
  deleteFact,
  searchFacts,
  getAllFacts,
  setFactVisibility,
  VisibilityTransitionError,
} from "@/lib/services/kb-service";
import { getDraft, upsertDraft, requestPublish } from "@/lib/services/page-service";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { type PageConfig, AVAILABLE_THEMES } from "@/lib/page-config/schema";
import { logEvent } from "@/lib/services/event-service";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { translatePageContent } from "@/lib/ai/translate";
import { saveMemory, type MemoryType } from "@/lib/services/memory-service";
import { proposeSoulChange, type SoulOverlay } from "@/lib/services/soul-service";
import { resolveConflict } from "@/lib/services/conflict-service";
import { FactValidationError } from "@/lib/services/fact-validation";
import { LAYOUT_TEMPLATES } from "@/lib/layout/contracts";
import { getLayoutTemplate } from "@/lib/layout/registry";
import { assignSlotsFromFacts } from "@/lib/layout/assign-slots";
import { extractLocks } from "@/lib/layout/lock-policy";

export function createAgentTools(sessionLanguage: string = "en", sessionId: string = "__default__", ownerKey?: string) {
  const effectiveOwnerKey = ownerKey ?? sessionId;
  return {
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
        const fact = await createFact({
          category,
          key,
          value,
          confidence,
        }, sessionId);
        return {
          success: true,
          factId: fact.id,
          category: fact.category,
          key: fact.key,
        };
      } catch (error) {
        if (error instanceof FactValidationError) {
          return { success: false, error: error.message, code: "FACT_VALIDATION_FAILED" };
        }
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { tool: "create_fact", error: String(error), category, key },
        });
        return { success: false, error: String(error) };
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
        const fact = updateFact({ factId, value }, sessionId);
        if (!fact) return { success: false, error: "Fact not found" };
        return { success: true, factId: fact.id };
      } catch (error) {
        if (error instanceof FactValidationError) {
          return { success: false, error: error.message, code: "FACT_VALIDATION_FAILED" };
        }
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { tool: "update_fact", error: String(error), factId },
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
        const deleted = deleteFact(factId, sessionId);
        return { success: deleted };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { tool: "delete_fact", error: String(error), factId },
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
        const results = searchFacts(query, sessionId);
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
      layoutTemplate: z.string().optional().describe("Layout template: vertical, sidebar-left, or bento-standard"),
    }),
    execute: async ({ username, theme, style, layoutTemplate }) => {
      try {
        const currentDraft = getDraft(sessionId);
        if (!currentDraft) {
          return { success: false, error: "No draft page exists. Generate a page first." };
        }

        const updated: PageConfig = { ...currentDraft.config };

        if (theme !== undefined) {
          if (!(AVAILABLE_THEMES as readonly string[]).includes(theme)) {
            return { success: false, error: `Unknown theme. Available: ${AVAILABLE_THEMES.join(", ")}` };
          }
          updated.theme = theme;
        }

        if (style !== undefined) {
          updated.style = { ...currentDraft.config.style, ...style } as PageConfig["style"];
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
        const draft = getDraft(sessionId);
        if (!draft) {
          return { success: false, error: "Page not found" };
        }
        const updated: PageConfig = { ...draft.config, theme };
        upsertDraft(username, updated, sessionId);
        logEvent({
          eventType: "page_config_updated",
          actor: "assistant",
          payload: { username, change: "theme", theme },
        });
        return { success: true, theme };
      } catch (error) {
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
        const draft = getDraft(sessionId);
        if (!draft) {
          return { success: false, error: "Page not found" };
        }
        const existing = draft.config;
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
        upsertDraft(username, updated, sessionId);
        return { success: true };
      } catch (error) {
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
        const facts = getAllFacts(sessionId);
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
        logEvent({
          eventType: "page_generated",
          actor: "assistant",
          payload: {
            username,
            factCount: facts.length,
            sectionCount: config.sections.length,
          },
        });
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
          payload: { tool: "generate_page", error: String(error) },
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

        // Mark the existing draft as pending approval — no recomposition,
        // so manual changes (theme, section order, content edits) are preserved.
        requestPublish(username, sessionId);

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
          payload: { tool: "request_publish", error: String(error) },
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
          payload: { tool: "propose_soul_change", error: String(error) },
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
          payload: { tool: "save_memory", error: String(error) },
        });
        return { success: false, error: String(error) };
      }
    },
  }),

  set_layout: tool({
    description:
      "Change the page layout template. Available: vertical, sidebar-left, bento-standard.",
    parameters: z.object({
      username: z.string().describe("The username for the page"),
      layoutTemplate: z
        .enum(LAYOUT_TEMPLATES)
        .describe("Layout template to use"),
    }),
    execute: async ({ username, layoutTemplate }) => {
      try {
        const draft = getDraft(sessionId);
        if (!draft) {
          return { success: false, error: "Page not found" };
        }

        const template = getLayoutTemplate(layoutTemplate);
        const locks = extractLocks(draft.config.sections);
        const { sections, issues } = assignSlotsFromFacts(
          template,
          draft.config.sections,
          locks,
        );

        const errors = issues.filter((i) => i.severity === "error");
        if (errors.length > 0) {
          return {
            success: false,
            error: "Layout incompatible",
            issues: errors,
          };
        }

        const updated: PageConfig = {
          ...draft.config,
          layoutTemplate,
          sections,
        };
        upsertDraft(username, updated, sessionId);

        const warnings = issues.filter((i) => i.severity === "warning");
        logEvent({
          eventType: "page_config_updated",
          actor: "assistant",
          payload: { username, change: "layout", layoutTemplate },
        });
        return { success: true, layoutTemplate, warnings };
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
          payload: { tool: "resolve_conflict", error: String(error) },
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
        const fact = setFactVisibility(factId, visibility, "assistant", sessionId);
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
          payload: { tool: "set_fact_visibility", error: String(error), factId },
        });
        return { success: false, error: String(error) };
      }
    },
  }),
  };
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
export const agentTools = createAgentTools("en", "__default__");
