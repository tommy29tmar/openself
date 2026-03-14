import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("shared-rules tool transparency", () => {
  const code = readFileSync("src/lib/agent/policies/shared-rules.ts", "utf-8");

  it("should contain TOOL TRANSPARENCY rule", () => {
    expect(code).toContain("TOOL TRANSPARENCY");
  });

  it("should forbid mentioning tool names in responses", () => {
    expect(code).toMatch(/NEVER\s+mention\s+tool\s+names/i);
  });
});
