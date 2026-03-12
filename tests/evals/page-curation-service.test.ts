import { describe, it, expect } from "vitest";
import { buildCurationPrompt, parseCurationResponse } from "@/lib/services/page-curation-service";

describe("page-curation-service", () => {
  describe("buildCurationPrompt", () => {
    it("builds a prompt for a single section with facts and soul", () => {
      const prompt = buildCurationPrompt({
        sectionType: "bio",
        currentContent: { text: "i am a developer at acme" },
        relevantFacts: [
          { id: "f1", category: "identity", key: "role", value: { role: "Software Developer" } },
          { id: "f2", category: "identity", key: "company", value: { company: "Acme Corp" } },
        ],
        soulCompiled: "Professional, confident tone. First person.",
        existingOverrides: [],
      });
      expect(prompt).toContain("bio");
      expect(prompt).toContain("Software Developer");
      expect(prompt).toContain("Acme Corp");
      expect(prompt).toContain("Professional, confident tone");
    });
  });

  describe("parseCurationResponse", () => {
    it("parses section-level suggestion", () => {
      const response = {
        suggestions: [
          {
            type: "section" as const,
            sectionType: "bio",
            fields: { description: "I'm a software developer crafting solutions at Acme Corp." },
            reason: "More professional wording",
          },
        ],
      };
      const parsed = parseCurationResponse(response);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe("section");
    });

    it("parses item-level suggestion", () => {
      const response = {
        suggestions: [
          {
            type: "item" as const,
            sectionType: "projects",
            factId: "f1",
            fields: { title: "OpenSelf" },
            reason: "Correct capitalization",
          },
        ],
      };
      const parsed = parseCurationResponse(response);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe("item");
      expect(parsed[0].factId).toBe("f1");
    });

    it("skips suggestions for agent-curated items", () => {
      const response = {
        suggestions: [
          {
            type: "item" as const,
            sectionType: "projects",
            factId: "f1",
            fields: { title: "Better Title" },
            reason: "Improvement",
          },
        ],
      };
      const agentCuratedFactIds = new Set(["f1"]);
      const parsed = parseCurationResponse(response, agentCuratedFactIds);
      expect(parsed).toHaveLength(0);
    });

    it("filters out suggestions with empty fields", () => {
      const response = {
        suggestions: [
          {
            type: "section" as const,
            sectionType: "bio",
            fields: {},
            reason: "No changes",
          },
        ],
      };
      const parsed = parseCurationResponse(response);
      expect(parsed).toHaveLength(0);
    });
  });
});
