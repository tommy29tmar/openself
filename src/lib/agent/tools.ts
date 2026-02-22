import { tool } from "ai";
import { z } from "zod";
import {
  createFact,
  updateFact,
  deleteFact,
  searchFacts,
  getAllFacts,
} from "@/lib/services/kb-service";
import { upsertPage, getPageByUsername } from "@/lib/services/page-service";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import type { PageConfig } from "@/lib/page-config/schema";
import { logEvent } from "@/lib/services/event-service";

export const agentTools = {
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
        upsertPage(username, config as PageConfig);
        logEvent({
          eventType: "page_config_updated",
          actor: "assistant",
          payload: { username, sections: (config as PageConfig).sections?.length ?? 0 },
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
      "Change the page theme. Available themes: minimal, warm, bold, elegant, hacker.",
    parameters: z.object({
      username: z.string().describe("The username for the page"),
      theme: z
        .string()
        .describe("Theme name: minimal, warm, bold, elegant, or hacker"),
    }),
    execute: async ({ username, theme }) => {
      try {
        const existing = getPageByUsername(username);
        if (!existing) {
          return { success: false, error: "Page not found" };
        }
        const updated: PageConfig = { ...existing, theme };
        upsertPage(username, updated);
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
        const existing = getPageByUsername(username);
        if (!existing) {
          return { success: false, error: "Page not found" };
        }
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
        upsertPage(username, updated);
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
        const config = composeOptimisticPage(facts, username, language ?? "en");
        upsertPage(username, config);
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

  publish_page: tool({
    description:
      "Publish the user's page with their chosen username. Call this when the user approves the page and picks a username. The page will be accessible at /username.",
    parameters: z.object({
      username: z
        .string()
        .describe(
          "The username chosen by the user for their public page URL",
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
          return { success: false, error: "No facts to publish" };
        }
        const config = composeOptimisticPage(facts, username, language ?? "en");
        upsertPage(username, config);
        logEvent({
          eventType: "page_published",
          actor: "assistant",
          payload: {
            username,
            factCount: facts.length,
            sectionCount: config.sections.length,
          },
        });
        return {
          success: true,
          url: `/${username}`,
          sections: config.sections.map((s) => s.type),
        };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { tool: "publish_page", error: String(error) },
        });
        return { success: false, error: String(error) };
      }
    },
  }),
};
