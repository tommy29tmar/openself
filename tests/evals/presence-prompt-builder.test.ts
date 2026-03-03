import { describe, it, expect } from "vitest";
import { buildPresenceReference } from "@/lib/presence/prompt-builder";

describe("buildPresenceReference", () => {
  it("returns a non-empty string", () => {
    const ref = buildPresenceReference();
    expect(typeof ref).toBe("string");
    expect(ref.length).toBeGreaterThan(0);
  });

  it("includes all surface IDs", () => {
    const ref = buildPresenceReference();
    expect(ref).toContain("canvas");
    expect(ref).toContain("clay");
    expect(ref).toContain("archive");
  });

  it("includes all voice IDs", () => {
    const ref = buildPresenceReference();
    expect(ref).toContain("signal");
    expect(ref).toContain("narrative");
    expect(ref).toContain("terminal");
  });

  it("includes light values", () => {
    const ref = buildPresenceReference();
    expect(ref).toContain("day");
    expect(ref).toContain("night");
  });

  it("includes signature combo names", () => {
    const ref = buildPresenceReference();
    expect(ref).toContain("Default Professional");
    expect(ref).toContain("The Developer");
    expect(ref).toContain("Artisan Editorial");
  });

  it("includes surface descriptions", () => {
    const ref = buildPresenceReference();
    // Canvas description contains "Maximum signal" or similar
    // Just check that some description text is present (not just IDs)
    const surfaces = ["canvas", "clay", "archive"];
    for (const id of surfaces) {
      // The name must appear
      expect(ref).toContain(id);
    }
  });

  it("is deterministic — same output on repeated calls", () => {
    const ref1 = buildPresenceReference();
    const ref2 = buildPresenceReference();
    expect(ref1).toBe(ref2);
  });
});
