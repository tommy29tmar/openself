import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateObject = vi.fn();
vi.mock("ai", () => ({
  generateObject: (...args: any[]) => mockGenerateObject(...args),
}));
vi.mock("@/lib/ai/provider", () => ({ getModel: () => "mock-model", getModelForTier: () => "mock-model" }));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import {
  analyzeConformity,
  generateRewrite,
  type ConformityIssue,
} from "@/lib/services/conformity-analyzer";
import type { SectionCopyStateRow } from "@/lib/services/section-copy-state-service";

function makeState(type: string, content: string): SectionCopyStateRow {
  return {
    id: 1,
    ownerKey: "owner1",
    sectionType: type,
    language: "en",
    personalizedContent: JSON.stringify({ description: content }),
    factsHash: "fh",
    soulHash: "sh",
    approvedAt: "2026-01-01",
    source: "live",
  };
}

describe("analyzeConformity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when LLM finds no issues", async () => {
    mockGenerateObject.mockResolvedValue({ object: { issues: [] } });
    const states = [makeState("bio", "A passionate developer")];
    const result = await analyzeConformity(
      states,
      "Warm and friendly",
      "owner1",
    );
    expect(result).toEqual([]);
  });

  it("returns issues from Phase 1 analysis", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        issues: [
          {
            sectionType: "bio",
            issueType: "tone_drift",
            reason: "Bio uses formal tone instead of warm",
            severity: "medium",
          },
        ],
      },
    });
    const states = [makeState("bio", "The developer works...")];
    const result = await analyzeConformity(
      states,
      "Warm and casual",
      "owner1",
    );
    expect(result).toHaveLength(1);
    expect(result[0].sectionType).toBe("bio");
    expect(result[0].issueType).toBe("tone_drift");
  });

  it("caps issues at 3", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        issues: [
          {
            sectionType: "bio",
            issueType: "tone_drift",
            reason: "r1",
            severity: "low",
          },
          {
            sectionType: "skills",
            issueType: "contradiction",
            reason: "r2",
            severity: "low",
          },
          {
            sectionType: "interests",
            issueType: "stale_content",
            reason: "r3",
            severity: "low",
          },
          {
            sectionType: "projects",
            issueType: "tone_drift",
            reason: "r4",
            severity: "low",
          },
        ],
      },
    });
    const states = [makeState("bio", "text"), makeState("skills", "text")];
    const result = await analyzeConformity(states, "Tone", "owner1");
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("returns empty array when no active states", async () => {
    const result = await analyzeConformity([], "Tone", "owner1");
    expect(result).toEqual([]);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("returns empty array on LLM error", async () => {
    mockGenerateObject.mockRejectedValue(new Error("LLM error"));
    const states = [makeState("bio", "text")];
    const result = await analyzeConformity(states, "Tone", "owner1");
    expect(result).toEqual([]);
  });
});

describe("generateRewrite", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns rewritten content on success", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { rewrittenContent: { description: "Better bio text" } },
    });
    const issue: ConformityIssue = {
      sectionType: "bio",
      issueType: "tone_drift",
      reason: "Too formal",
      severity: "medium",
    };
    const result = await generateRewrite(
      "bio",
      "Old text",
      issue,
      "Warm tone",
    );
    expect(result).toEqual({ description: "Better bio text" });
  });

  it("returns null on LLM error", async () => {
    mockGenerateObject.mockRejectedValue(new Error("LLM error"));
    const issue: ConformityIssue = {
      sectionType: "bio",
      issueType: "tone_drift",
      reason: "Too formal",
      severity: "medium",
    };
    const result = await generateRewrite(
      "bio",
      "Old text",
      issue,
      "Warm tone",
    );
    expect(result).toBeNull();
  });
});
