import { describe, it, expect } from "vitest";
import { hasRealChange } from "@/lib/worker/handlers/curate-page";

describe("hasRealChange", () => {
  it("should return false when all proposed values match current", () => {
    expect(hasRealChange({ title: "Formazione" }, { title: "Formazione" })).toBe(false);
  });

  it("should return true when at least one value differs", () => {
    expect(hasRealChange({ title: "Le mie pratiche" }, { title: "Formazione" })).toBe(true);
  });

  it("should return true when proposed adds a new field", () => {
    expect(hasRealChange({ title: "X", description: "New" }, { title: "X" })).toBe(true);
  });

  it("should handle item-level comparison", () => {
    expect(hasRealChange({ frequency: "ogni giorno" }, { name: "Yoga", frequency: "daily" })).toBe(true);
  });

  it("should detect no change for item same values", () => {
    expect(hasRealChange({ name: "Yoga" }, { name: "Yoga", frequency: "daily" })).toBe(false);
  });
});
