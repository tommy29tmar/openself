import { describe, it, expect } from "vitest";
import { resolveLayoutAlias } from "@/lib/layout/contracts";

describe("resolveLayoutAlias", () => {
  it("passes through valid canonical IDs unchanged", () => {
    expect(resolveLayoutAlias("monolith")).toBe("monolith");
    expect(resolveLayoutAlias("cinematic")).toBe("cinematic");
    expect(resolveLayoutAlias("curator")).toBe("curator");
    expect(resolveLayoutAlias("architect")).toBe("architect");
  });

  it("resolves case-insensitive canonical IDs", () => {
    expect(resolveLayoutAlias("Cinematic")).toBe("cinematic");
    expect(resolveLayoutAlias("ARCHITECT")).toBe("architect");
    expect(resolveLayoutAlias("Monolith")).toBe("monolith");
    expect(resolveLayoutAlias("CURATOR")).toBe("curator");
  });

  it("resolves user-facing names to canonical IDs", () => {
    expect(resolveLayoutAlias("The Architect")).toBe("architect");
    expect(resolveLayoutAlias("THE CURATOR")).toBe("curator");
    expect(resolveLayoutAlias("the monolith")).toBe("monolith");
    expect(resolveLayoutAlias("The Monolith")).toBe("monolith");
    expect(resolveLayoutAlias("the architect")).toBe("architect");
    expect(resolveLayoutAlias("The Curator")).toBe("curator");
  });

  it("resolves legacy aliases", () => {
    expect(resolveLayoutAlias("bento")).toBe("architect");
    expect(resolveLayoutAlias("vertical")).toBe("monolith");
    expect(resolveLayoutAlias("sidebar")).toBe("curator");
    expect(resolveLayoutAlias("bento-standard")).toBe("architect");
    expect(resolveLayoutAlias("sidebar-left")).toBe("curator");
  });

  it("returns trimmed input for unknown values (preserves error messages)", () => {
    expect(resolveLayoutAlias("unknown")).toBe("unknown");
    expect(resolveLayoutAlias("  Unknown  ")).toBe("Unknown");
  });
});
