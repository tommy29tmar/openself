import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("createFact profile ensure", () => {
  const code = readFileSync("src/lib/services/kb-service.ts", "utf-8");

  it("should ensure profile row exists before fact insert", () => {
    expect(code).toMatch(/INSERT\s+OR\s+IGNORE\s+INTO\s+profiles/i);
  });
});
