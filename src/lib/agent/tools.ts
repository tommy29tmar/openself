import { tool } from "ai";
import { z } from "zod";
import {
  createFact,
  updateFact,
  deleteFact,
  searchFacts,
  getAllFacts,
} from "@/lib/services/kb-service";
import { getDraft, upsertDraft, requestPublish } from "@/lib/services/page-service";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { type PageConfig, AVAILABLE_THEMES } from "@/lib/page-config/schema";
import { logEvent } from "@/lib/services/event-service";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { translatePageContent } from "@/lib/ai/translate";

export function createAgentTools(sessionLanguage: string = "en") {
  return {
  create_fact: tool({
    description:
      "Store a new fact about the user in the knowledge base. Use this whenever the user shares information about themselves (name, job, skills, interests, projects, etc). Break complex info into separate atomic facts.",
    parameters: z.object({
      category: z
        .string()
        .describe(
          "Fact category: identity, experience, project, skill, interest, achievement, activity, social, reading, or any relevant category",
        ),
      key: z
        .string()
        .describe(
          "Unique key within the category (e.g., 'typescript' for a skill, 'acme-corp' for experience). Use lowercase kebab-case.",
        ),
      value: z
        .record(z.unknown())
        .describe(
          "Structured value object. Examples: {name: 'TypeScript', level: 'advanced'} for skills, {full: 'Tommaso Rossi'} for identity name, {role: 'Economist', company: 'Acme', status: 'current'} for experience.",
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
        });
        return {
          success: true,
          factId: fact.id,
          category: fact.category,
          key: fact.key,
        };
      } catch (error) {
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
      "Update an existing fact's value. Use when information changes (e.g., user left a job, changed location).",
    parameters: z.object({
      factId: z.string().describe("The ID of the fact to update"),
      value: z
        .record(z.unknown())
        .describe("The new value object to replace the existing one"),
    }),
    execute: async ({ factId, value }) => {
      try {
        const fact = updateFact({ factId, value });
        if (!fact) return { success: false, error: "Fact not found" };
        return { success: true, factId: fact.id };
      } catch (error) {
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
        const deleted = deleteFact(factId);
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
        const results = searchFacts(query);
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

  update_page_config: tool({
    description:
      "Update the page configuration. Use for structural changes like adding/removing sections, changing content, or modifying style. Provide a full valid PageConfig object.",
    parameters: z.object({
      username: z.string().describe("The username for the page"),
      config: z
        .record(z.unknown())
        .describe("The full PageConfig object to save"),
    }),
    execute: async ({ username, config }) => {
      try {
        // Preserve user's style customizations (theme, colors, font) from
        // the existing draft so agent-driven structural changes don't reset
        // manually chosen style settings.
        const currentDraft = getDraft();
        const incoming = config as PageConfig;
        const merged: PageConfig = currentDraft
          ? { ...incoming, theme: currentDraft.config.theme, style: currentDraft.config.style }
          : incoming;
        upsertDraft(username, merged);
        logEvent({
          eventType: "page_config_updated",
          actor: "assistant",
          payload: { username, sections: merged.sections?.length ?? 0 },
        });
        return { success: true };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: {
            tool: "update_page_config",
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
      "Change the page theme. Available themes: minimal, warm.",
    parameters: z.object({
      username: z.string().describe("The username for the page"),
      theme: z
        .string()
        .describe("Theme name: minimal or warm"),
    }),
    execute: async ({ username, theme }) => {
      try {
        if (!(AVAILABLE_THEMES as readonly string[]).includes(theme)) {
          return { success: false, error: `Unknown theme. Available: ${AVAILABLE_THEMES.join(", ")}` };
        }
        const draft = getDraft();
        if (!draft) {
          return { success: false, error: "Page not found" };
        }
        const updated: PageConfig = { ...draft.config, theme };
        upsertDraft(username, updated);
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
        const draft = getDraft();
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
        upsertDraft(username, updated);
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
        const facts = getAllFacts();
        if (facts.length === 0) {
          return { success: false, error: "No facts in knowledge base yet" };
        }
        // Preserve user's style customizations (theme, colors, font) from
        // the existing draft. composeOptimisticPage always uses defaults.
        const currentDraft = getDraft();
        const composed = composeOptimisticPage(
          facts,
          username,
          language ?? sessionLanguage,
        );
        const styled = currentDraft
          ? { ...composed, theme: currentDraft.config.theme, style: currentDraft.config.style }
          : composed;

        // Translate fact-derived content if target language differs from original
        const targetLang = language ?? sessionLanguage;
        const factLang = getFactLanguage();
        const config = await translatePageContent(styled, targetLang, factLang);

        upsertDraft(username, config);
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
        const draft = getDraft();
        if (!draft) {
          return { success: false, error: "No draft page to publish. Generate a page first." };
        }

        // Mark the existing draft as pending approval — no recomposition,
        // so manual changes (theme, section order, content edits) are preserved.
        requestPublish(username);

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
  };
}

// Backward compatibility for tests/imports that expect a static object.
export const agentTools = createAgentTools("en");
