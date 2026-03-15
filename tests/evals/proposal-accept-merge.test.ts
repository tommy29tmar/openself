import { describe, it, expect } from "vitest";
import { deepMergeProposal } from "@/lib/services/proposal-service";

describe("deepMergeProposal", () => {
  it("should overlay proposed fields onto current without erasing others", () => {
    const current = { name: "Giulia", tagline: "Old tagline", location: "Napoli" };
    const proposed = { tagline: "New tagline" };
    const result = deepMergeProposal(current, proposed);
    expect(result).toEqual({ name: "Giulia", tagline: "New tagline", location: "Napoli" });
  });

  it("should preserve current when proposed is empty", () => {
    const current = { name: "Giulia", location: "Napoli" };
    const result = deepMergeProposal(current, {});
    expect(result).toEqual({ name: "Giulia", location: "Napoli" });
  });

  it("should reject hallucinated keys not in current or ADDITIVE_FIELDS", () => {
    const current = { name: "Giulia", tagline: "Old" };
    const proposed = { tagline: "New", hallucinated_xyz: "Nope" };
    const result = deepMergeProposal(current, proposed);
    expect(result.tagline).toBe("New");
    expect(result).not.toHaveProperty("hallucinated_xyz");
  });

  it("should allow known additive fields even if not in current", () => {
    const current = { name: "Giulia" };
    const proposed = { description: "A new description" };
    const result = deepMergeProposal(current, proposed);
    expect(result.description).toBe("A new description");
  });

  it("should handle null proposed values by keeping current value", () => {
    const current = { name: "Giulia", tagline: "Old" };
    const proposed = { tagline: null };
    const result = deepMergeProposal(current, proposed);
    expect(result.tagline).toBe("Old");
  });

  it("should allow groups and items as additive fields", () => {
    const current = { title: "Skills" };
    const proposed = { groups: [{ title: "New", items: ["A", "B"] }] };
    const result = deepMergeProposal(current, proposed);
    expect(result.groups).toEqual([{ title: "New", items: ["A", "B"] }]);
  });
});
