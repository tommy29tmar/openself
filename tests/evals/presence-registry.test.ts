import { describe, it, expect } from "vitest";
import { listSurfaces, getSurface, listVoices, getVoice, isValidSurface, isValidVoice, isValidLight } from "@/lib/presence";
import { SIGNATURE_COMBOS } from "@/lib/presence";

describe("Presence Registry — surfaces", () => {
  it("lists exactly 3 surfaces", () => {
    expect(listSurfaces()).toHaveLength(3);
  });

  it("surfaces have required fields", () => {
    for (const s of listSurfaces()) {
      expect(s.id).toBeTruthy();
      expect(s.displayName).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.cssClass).toBe(`surface-${s.id}`);
      expect(typeof s.readingMax).toBe("number");
      expect(typeof s.sectionLabelOpacity).toBe("number");
    }
  });

  it("getSurface returns correct surface", () => {
    expect(getSurface("canvas")?.displayName).toBe("Canvas");
    expect(getSurface("clay")?.displayName).toBe("Clay");
    expect(getSurface("archive")?.displayName).toBe("Archive");
    expect(getSurface("unknown")).toBeUndefined();
  });

  it("isValidSurface validates correctly", () => {
    expect(isValidSurface("canvas")).toBe(true);
    expect(isValidSurface("clay")).toBe(true);
    expect(isValidSurface("archive")).toBe(true);
    expect(isValidSurface("minimal")).toBe(false);
    expect(isValidSurface("")).toBe(false);
  });
});

describe("Presence Registry — voices", () => {
  it("lists exactly 3 voices", () => {
    expect(listVoices()).toHaveLength(3);
  });

  it("voices have required fields", () => {
    for (const v of listVoices()) {
      expect(v.id).toBeTruthy();
      expect(v.displayName).toBeTruthy();
      expect(v.headingFont).toBeTruthy();
      expect(v.bodyFont).toBeTruthy();
      expect(v.cssClass).toBe(`voice-${v.id}`);
      expect(v.description).toBeTruthy();
    }
  });

  it("getVoice returns correct voice", () => {
    expect(getVoice("signal")?.displayName).toBe("Signal");
    expect(getVoice("narrative")?.displayName).toBe("Narrative");
    expect(getVoice("terminal")?.displayName).toBe("Terminal");
    expect(getVoice("unknown")).toBeUndefined();
  });

  it("isValidVoice validates correctly", () => {
    expect(isValidVoice("signal")).toBe(true);
    expect(isValidVoice("narrative")).toBe(true);
    expect(isValidVoice("terminal")).toBe(true);
    expect(isValidVoice("inter")).toBe(false);
  });
});

describe("Presence Registry — light", () => {
  it("isValidLight validates correctly", () => {
    expect(isValidLight("day")).toBe(true);
    expect(isValidLight("night")).toBe(true);
    expect(isValidLight("dark")).toBe(false);
    expect(isValidLight("light")).toBe(false);
  });
});

describe("Presence Registry — SIGNATURE_COMBOS", () => {
  it("has exactly 6 combos", () => {
    expect(SIGNATURE_COMBOS).toHaveLength(6);
  });

  it("all combos reference valid surface/voice/light", () => {
    for (const combo of SIGNATURE_COMBOS) {
      expect(isValidSurface(combo.surface)).toBe(true);
      expect(isValidVoice(combo.voice)).toBe(true);
      expect(isValidLight(combo.light)).toBe(true);
      expect(combo.name).toBeTruthy();
      expect(combo.for).toBeTruthy();
    }
  });
});
