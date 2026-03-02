import { describe, it, expect } from "vitest";
import { recentImportDirective } from "@/lib/agent/policies/situations";
import type { ImportGapReport } from "@/lib/connectors/import-gap-analyzer";

describe("recentImportDirective", () => {
  it("returns prompt text mentioning current role", () => {
    const report: ImportGapReport = {
      summary: {
        currentRole: "Engineer at Acme",
        pastRoles: 3,
        educationCount: 2,
        languageCount: 1,
        skillCount: 5,
        certificationCount: 0,
      },
      gaps: [
        { priority: 1, type: "no_interests", description: "No interests found." },
      ],
    };
    const directive = recentImportDirective(report);
    expect(directive).toContain("Engineer at Acme");
    expect(directive).toContain("POST-IMPORT");
  });

  it("includes gap descriptions in the context block", () => {
    const report: ImportGapReport = {
      summary: { pastRoles: 1, educationCount: 0, languageCount: 0, skillCount: 0, certificationCount: 0 },
      gaps: [
        { priority: 1, type: "no_interests", description: "No interests found." },
        { priority: 2, type: "no_personal_description", description: "No bio." },
      ],
    };
    const directive = recentImportDirective(report);
    expect(directive).toContain("No interests found.");
    expect(directive).toContain("No bio.");
  });

  it("sanitizes text to max 100 chars per field", () => {
    const longRole = "A".repeat(200);
    const report: ImportGapReport = {
      summary: { currentRole: longRole, pastRoles: 0, educationCount: 0, languageCount: 0, skillCount: 0, certificationCount: 0 },
      gaps: [],
    };
    const directive = recentImportDirective(report);
    // The role in the output should be truncated
    expect(directive).not.toContain(longRole);
  });

  it("includes the import context delimiters for prompt hygiene", () => {
    const report: ImportGapReport = {
      summary: { pastRoles: 0, educationCount: 0, languageCount: 0, skillCount: 0, certificationCount: 0 },
      gaps: [],
    };
    const directive = recentImportDirective(report);
    expect(directive).toContain("--- BEGIN IMPORT CONTEXT ---");
    expect(directive).toContain("--- END IMPORT CONTEXT ---");
  });

  it("includes POST-IMPORT REVIEW MODE policy rules", () => {
    const report: ImportGapReport = {
      summary: { pastRoles: 0, educationCount: 0, languageCount: 0, skillCount: 0, certificationCount: 0 },
      gaps: [],
    };
    const directive = recentImportDirective(report);
    expect(directive).toContain("POST-IMPORT REVIEW MODE");
    expect(directive).toContain("generate");
  });
});
