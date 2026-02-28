import { describe, it, expect } from "vitest";
import { resolveLayoutAlias } from "@/lib/layout/contracts";

describe("resolveLayoutAlias", () => {
  it("maps 'bento' to 'bento-standard'", () => {
    expect(resolveLayoutAlias("bento")).toBe("bento-standard");
  });

  it("maps 'sidebar' to 'sidebar-left'", () => {
    expect(resolveLayoutAlias("sidebar")).toBe("sidebar-left");
  });

  it("passes through valid template IDs unchanged", () => {
    expect(resolveLayoutAlias("vertical")).toBe("vertical");
    expect(resolveLayoutAlias("sidebar-left")).toBe("sidebar-left");
    expect(resolveLayoutAlias("bento-standard")).toBe("bento-standard");
  });

  it("returns input unchanged for unknown values", () => {
    expect(resolveLayoutAlias("unknown")).toBe("unknown");
  });
});
