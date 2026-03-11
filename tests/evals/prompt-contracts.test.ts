import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { activeFreshPolicy } from "@/lib/agent/policies/active-fresh";
import { activeStalePolicy } from "@/lib/agent/policies/active-stale";

describe("prompt contracts", () => {
  const src = readFileSync("src/lib/agent/prompts.ts", "utf-8");

  it("TOOL_POLICY includes tool failure honesty rule with REQUIRES_CONFIRMATION exception", () => {
    expect(src).toMatch(/success.*false.*MUST.*report/i);
    expect(src).toMatch(/REQUIRES_CONFIRMATION.*not.*failure|REQUIRES_CONFIRMATION.*not.*error/i);
    expect(src).toMatch(/NEVER claim.*saved.*updated.*deleted.*unless.*tool.*success/i);
  });

  it("TOOL_POLICY includes REQUIRES_CONFIRMATION handling for identity and delete", () => {
    expect(src).toMatch(/REQUIRES_CONFIRMATION/);
    expect(src).toMatch(/confirm/i);
  });

  it("SAFETY_POLICY includes date fabrication prohibition", () => {
    expect(src).toMatch(/fabricat.*date/i);
  });

  it("DATA_MODEL_REFERENCE includes unsupported features list", () => {
    expect(src).toMatch(/UNSUPPORTED FEATURES/i);
    expect(src).toMatch(/[Vv]ideo/);
  });

  it("OUTPUT_CONTRACT includes silent fact-saving rule with all 4 error exceptions", () => {
    // Extract OUTPUT_CONTRACT specifically — avoid false positives from TOOL_POLICY
    const outputContractMatch = src.match(/OUTPUT_CONTRACT\s*=\s*`([\s\S]*?)`/);
    expect(outputContractMatch).not.toBeNull();
    const outputContract = outputContractMatch![1];

    expect(outputContract).toMatch(/save\s*facts\s*silently|do\s*not.*proactively.*announce/i);
    expect(outputContract).toMatch(/explicitly\s*asks.*recap|user.*asks.*what.*saved/i);
    // All 4 exceptions must be in OUTPUT_CONTRACT itself
    expect(outputContract).toMatch(/success.*false/i);
    expect(outputContract).toMatch(/REQUIRES_CONFIRMATION/);
    expect(outputContract).toMatch(/pageVisible.*false/i);
    expect(outputContract).toMatch(/recomposeOk.*false/i);
  });

  it("OUTPUT_CONTRACT bans standalone completion claims without a write tool", () => {
    const outputContractMatch = src.match(/OUTPUT_CONTRACT\s*=\s*`([\s\S]*?)`/);
    expect(outputContractMatch).not.toBeNull();
    const outputContract = outputContractMatch![1];

    expect(outputContract).toMatch(/did not call a write tool/i);
    expect(outputContract).toMatch(/Aggiunto|Salvato|Updated|Added|Done|Fatto/i);
  });

  it("experience facts must be created immediately even without dates", () => {
    // The old rule that prevented creating experience facts without dates must be gone
    expect(src).not.toMatch(/only create experience facts with dates/i);
    // The new rule must say facts are created with null start/end
    expect(src).toMatch(/experience.*without dates|without dates.*experience/i);
    expect(src).toMatch(/start.*null|null.*start/i);
  });

  it("TOOL_POLICY contains unified fact recording rule (single source of truth)", () => {
    expect(src).toMatch(/FACT RECORDING/);
    expect(src).toMatch(/NEVER delay.*accumulate.*across.*turns/i);
    expect(src).toMatch(/3\+.*NEW.*facts.*creates.*only.*batch_facts/i);
    expect(src).toMatch(/NEVER.*batch_facts.*identity/i);
  });

  it("workflow examples use current tool signatures", () => {
    expect(src).not.toContain("search_facts(category)");
    expect(src).not.toContain('search_facts("identity")');
    expect(src).not.toContain("create_fact(category, value)");
    expect(src).toContain('search_facts({ query: "identity role" })');
    expect(src).toContain("create_fact({ category, key, value })");
  });

  it("active-fresh policy includes preview-only reminder in update flow", () => {
    const policy = activeFreshPolicy("en");
    expect(policy).toMatch(/visible in preview/i);
    expect(policy).not.toMatch(/^.*"Done! Anything else\?".*$/m);
  });

  it("active-stale policy includes preview-only language in publish section", () => {
    const policy = activeStalePolicy("en");
    expect(policy).toMatch(/visible in.*preview/i);
  });
});
