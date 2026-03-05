import { describe, it, expect } from "vitest";
import { parsePositiveIntEnv } from "@/lib/constants";

describe("parsePositiveIntEnv", () => {
  it("parses a valid positive integer", () => {
    expect(parsePositiveIntEnv("250", 200)).toBe(250);
  });

  it("falls back for undefined", () => {
    expect(parsePositiveIntEnv(undefined, 200)).toBe(200);
  });

  it("falls back for invalid strings", () => {
    expect(parsePositiveIntEnv("not-a-number", 200)).toBe(200);
  });

  it("falls back for zero and negative values", () => {
    expect(parsePositiveIntEnv("0", 200)).toBe(200);
    expect(parsePositiveIntEnv("-5", 200)).toBe(200);
  });
});
