// tests/evals/shared-rules.test.ts
import { describe, it, expect } from "vitest";
import {
  sharedBehavioralRules,
  IMMEDIATE_EXECUTION_RULE,
} from "@/lib/agent/policies/shared-rules";

describe("sharedBehavioralRules", () => {
  const rules = sharedBehavioralRules();

  it("returns a non-empty string", () => {
    expect(typeof rules).toBe("string");
    expect(rules.length).toBeGreaterThan(100);
  });

  it("contains BEHAVIORAL RULES header", () => {
    expect(rules).toContain("BEHAVIORAL RULES");
  });

  it("limits to one question per turn", () => {
    expect(rules).toMatch(/one\s*question\s*per\s*turn/i);
  });

  it("has positive TURN CLOSING rule with anchor guidance", () => {
    expect(rules).toMatch(/TURN CLOSING/i);
    expect(rules).toMatch(/concrete anchor/i);
    expect(rules).toMatch(/confirmation/i);
  });

  it("bans open-ended deferrals with multilingual coverage", () => {
    expect(rules).toMatch(/NEVER.*open-ended.*deferral/i);
    // Verify key language coverage
    expect(rules).toMatch(/anything else/i);
    expect(rules).toMatch(/c'è altro/i);
    expect(rules).toMatch(/sonst noch etwas/i);
    expect(rules).toMatch(/何かあれば/);
  });

  it("does NOT duplicate response-length calibration (lives in CORE_CHARTER)", () => {
    expect(rules).not.toMatch(/response.*length/i);
    expect(rules).not.toMatch(/1.*2.*sentence/i);
  });

  it("defines clarification expiry with 2-STRIKE rule", () => {
    expect(rules).toMatch(/clarification/i);
    expect(rules).toMatch(/2-STRIKE/);
    expect(rules).toMatch(/strike 1.*strike 2/is);
    expect(rules).toMatch(/NEVER.*3rd/i);
  });

  it("contains ZERO conditional branching (no if/when state mentions)", () => {
    expect(rules).not.toMatch(/\bif\s+(in\s+)?first_visit\b/i);
    expect(rules).not.toMatch(/\bif\s+(in\s+)?steady.?state\b/i);
    expect(rules).not.toMatch(/\bif\s+(in\s+)?onboarding\b/i);
    expect(rules).not.toMatch(/\bexception.*first_visit\b/i);
    expect(rules).not.toMatch(/\bexception.*onboarding\b/i);
    expect(rules).not.toMatch(/\bexception.*first\s*page/i);
  });

  it("does NOT duplicate response-length exception from CORE_CHARTER", () => {
    expect(rules).not.toMatch(/first.*page.*generation.*longer/i);
  });
});

describe("IMMEDIATE_EXECUTION_RULE", () => {
  it("is a non-empty string", () => {
    expect(typeof IMMEDIATE_EXECUTION_RULE).toBe("string");
    expect(IMMEDIATE_EXECUTION_RULE.length).toBeGreaterThan(20);
  });

  it("mentions executing tool calls in THIS turn", () => {
    expect(IMMEDIATE_EXECUTION_RULE).toMatch(/this\s*turn/i);
  });

  it("immediate execution covers user confirming agent's concrete proposal", () => {
    const rule = IMMEDIATE_EXECUTION_RULE;
    // New clause: proposal confirmation triggers execution
    expect(rule).toMatch(/confirm|approv/i);
    expect(rule).toMatch(/your.*(suggestion|proposal)|you.*(proposed|suggested)/i);
    // Original guards preserved: "concrete" and "enough info" still present
    expect(rule).toMatch(/concrete/i);
    expect(rule).toMatch(/enough info/i);
  });
});

// STRUCTURAL_EXPLANATION_RULE removed — planning-protocol is the single source.
