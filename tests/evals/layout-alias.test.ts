import { describe, it, expect } from "vitest";
import { resolveLayoutAlias } from "@/lib/layout/contracts";

describe("resolveLayoutAlias", () => {
  it("passes through 'architect' unchanged", () => {
    expect(resolveLayoutAlias("architect")).toBe("architect");
  });

  it("passes through 'curator' unchanged", () => {
    expect(resolveLayoutAlias("curator")).toBe("curator");
  });

  it("passes through valid template IDs unchanged", () => {
    expect(resolveLayoutAlias("monolith")).toBe("monolith");
    expect(resolveLayoutAlias("curator")).toBe("curator");
    expect(resolveLayoutAlias("architect")).toBe("architect");
  });

  it("returns input unchanged for unknown values", () => {
    expect(resolveLayoutAlias("unknown")).toBe("unknown");
  });
});
