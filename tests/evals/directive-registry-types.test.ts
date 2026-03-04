// tests/evals/directive-registry-types.test.ts
import { describe, it, expect } from "vitest";
import { DirectiveConflictError, SITUATION_REQUIRED_KEYS } from "@/lib/agent/policies/directive-registry";

describe("directive-registry types", () => {
  it("DirectiveConflictError is an Error", () => {
    const e = new DirectiveConflictError("test");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("DirectiveConflictError");
  });

  it("SITUATION_REQUIRED_KEYS covers all situations", () => {
    const keys = Object.keys(SITUATION_REQUIRED_KEYS);
    expect(keys).toContain("has_thin_sections");
    expect(keys).toContain("has_pending_proposals");
    expect(keys).toContain("has_recent_import");
  });

  it("has_recent_import has no required keys (importGapReport is optional)", () => {
    expect(SITUATION_REQUIRED_KEYS.has_recent_import).toEqual([]);
  });
});
