import { describe, it, expect } from "vitest";
import { validatePresenceFields } from "@/lib/page-config/schema";

describe("validatePresenceFields", () => {
  it("accepts valid presence fields", () => {
    const errors = validatePresenceFields({
      surface: "canvas",
      voice: "signal",
      light: "day",
    } as any);
    expect(errors).toHaveLength(0);
  });

  it("accepts all valid surface values", () => {
    for (const surface of ["canvas", "clay", "archive"]) {
      const errors = validatePresenceFields({ surface, voice: "signal", light: "day" } as any);
      expect(errors).toHaveLength(0);
    }
  });

  it("accepts all valid voice values", () => {
    for (const voice of ["signal", "narrative", "terminal"]) {
      const errors = validatePresenceFields({ surface: "canvas", voice, light: "day" } as any);
      expect(errors).toHaveLength(0);
    }
  });

  it("accepts both valid light values", () => {
    for (const light of ["day", "night"]) {
      const errors = validatePresenceFields({ surface: "canvas", voice: "signal", light } as any);
      expect(errors).toHaveLength(0);
    }
  });

  it("rejects unknown surface", () => {
    const errors = validatePresenceFields({ surface: "minimal", voice: "signal", light: "day" } as any);
    expect(errors.some(e => e.includes("surface"))).toBe(true);
  });

  it("rejects unknown voice", () => {
    const errors = validatePresenceFields({ surface: "canvas", voice: "inter", light: "day" } as any);
    expect(errors.some(e => e.includes("voice"))).toBe(true);
  });

  it("rejects unknown light", () => {
    const errors = validatePresenceFields({ surface: "canvas", voice: "signal", light: "dark" } as any);
    expect(errors.some(e => e.includes("light"))).toBe(true);
  });

  it("reports all errors when multiple fields are invalid", () => {
    const errors = validatePresenceFields({ surface: "warm", voice: "inter", light: "dark" } as any);
    expect(errors).toHaveLength(3);
  });

  it("error messages include the invalid value", () => {
    const errors = validatePresenceFields({ surface: "minimal", voice: "signal", light: "day" } as any);
    expect(errors[0]).toContain("minimal");
  });
});
