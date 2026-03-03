import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

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
});
