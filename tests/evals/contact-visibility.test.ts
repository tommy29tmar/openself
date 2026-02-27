import { describe, it, expect } from "vitest";
import { isSensitiveCategory, initialVisibility, canProposePublic } from "@/lib/visibility/policy";
import { filterPublishableFacts } from "@/lib/services/page-projection";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: overrides.id ?? `fact-${Math.random().toString(36).slice(2, 8)}`,
    category: overrides.category as string,
    key: overrides.key as string,
    value: overrides.value ?? {},
    source: "chat",
    confidence: 1.0,
    visibility: overrides.visibility ?? "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("contact category is user-controlled (not sensitive)", () => {
  it("contact should NOT be a sensitive category", () => {
    expect(isSensitiveCategory("contact")).toBe(false);
  });

  it("private-contact should still be sensitive", () => {
    expect(isSensitiveCategory("private-contact")).toBe(true);
  });

  it("assistant can propose contact as public (in PROPOSAL_ALLOWLIST)", () => {
    expect(canProposePublic("contact", 0.9)).toBe(true);
  });

  it("assistant cannot propose compensation as public (truly sensitive)", () => {
    expect(canProposePublic("compensation", 0.9)).toBe(false);
  });

  it("contact facts should get proposed visibility during onboarding", () => {
    const vis = initialVisibility({
      mode: "onboarding",
      category: "contact",
      confidence: 0.9,
    });
    expect(vis).toBe("proposed");
  });

  it("contact facts with visibility=public should pass filterPublishableFacts", () => {
    const facts = [
      makeFact({ category: "contact", key: "email", value: { email: "a@b.com" }, visibility: "public" }),
    ];
    const result = filterPublishableFacts(facts as any);
    expect(result).toHaveLength(1);
  });

  it("contact facts with visibility=proposed should pass filterPublishableFacts", () => {
    const facts = [
      makeFact({ category: "contact", key: "email", value: { email: "a@b.com" }, visibility: "proposed" }),
    ];
    const result = filterPublishableFacts(facts as any);
    expect(result).toHaveLength(1);
  });

  it("compensation should still be blocked (truly sensitive)", () => {
    expect(isSensitiveCategory("compensation")).toBe(true);
    const facts = [
      makeFact({ category: "compensation", key: "salary", value: { amount: "100k" }, visibility: "public" }),
    ];
    expect(filterPublishableFacts(facts as any)).toHaveLength(0);
  });
});
