// tests/evals/validate-directive-policy.test.ts
import { describe, it, expect, vi } from "vitest";
import { validateDirectivePolicy } from "@/lib/agent/policies/validate-directive-policy";
import { DIRECTIVE_POLICY } from "@/lib/agent/policies/directive-registry";

vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) },
}));

describe("validateDirectivePolicy", () => {
  it("passes for the real DIRECTIVE_POLICY", () => {
    expect(() => validateDirectivePolicy(DIRECTIVE_POLICY)).not.toThrow();
  });

  it("throws on self-conflict", () => {
    const bad = {
      ...DIRECTIVE_POLICY,
      has_thin_sections: { ...DIRECTIVE_POLICY.has_thin_sections, incompatibleWith: ["has_thin_sections"] as any },
    };
    expect(() => validateDirectivePolicy(bad)).toThrow("Self-conflict");
  });

  it("throws on asymmetric incompatibleWith", () => {
    const bad = {
      ...DIRECTIVE_POLICY,
      has_archivable_facts: { ...DIRECTIVE_POLICY.has_archivable_facts, incompatibleWith: [] },
    };
    expect(() => validateDirectivePolicy(bad)).toThrow("Asymmetric");
  });

  it("throws on invalid journeyState in eligibleStates", () => {
    const bad = {
      ...DIRECTIVE_POLICY,
      has_stale_facts: { ...DIRECTIVE_POLICY.has_stale_facts, eligibleStates: ["nonexistent_state" as any] },
    };
    expect(() => validateDirectivePolicy(bad)).toThrow("Unknown journeyState");
  });

  it("throws on equal-priority incompatible pair", () => {
    const bad = {
      ...DIRECTIVE_POLICY,
      has_thin_sections: { ...DIRECTIVE_POLICY.has_thin_sections, priority: 4 }, // same as has_archivable_facts
    };
    expect(() => validateDirectivePolicy(bad)).toThrow("Equal-priority");
  });
});
