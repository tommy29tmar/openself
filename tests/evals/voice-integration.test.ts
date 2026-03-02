import { describe, it, expect } from "vitest";

describe("voice integration contracts", () => {
  it("feature flags default to false", async () => {
    const { isVoiceEnabled, isServerSttEnabled } = await import("@/lib/voice/feature-flags");
    expect(isVoiceEnabled()).toBe(false);
    expect(isServerSttEnabled()).toBe(false);
  });

  it("VoiceState enum has all 8 states", async () => {
    const { VoiceState } = await import("@/hooks/useVoiceManager");
    const states = Object.values(VoiceState);
    expect(states).toContain("idle");
    expect(states).toContain("listening");
    expect(states).toContain("transcribing");
    expect(states).toContain("waiting");
    expect(states).toContain("speaking");
    expect(states).toContain("error");
    expect(states).toContain("permission_denied");
    expect(states).toContain("unavailable");
    expect(states).toHaveLength(8);
  });

  it("SttResult type guard works correctly", async () => {
    const { isSttResult } = await import("@/hooks/useSttProvider");
    expect(isSttResult({ text: "hello", isFinal: true })).toBe(true);
    expect(isSttResult({ text: "hello" })).toBe(false);
    expect(isSttResult(null)).toBe(false);
    expect(isSttResult("string")).toBe(false);
  });

  it("TtsState enum has 3 states", async () => {
    const { TtsState } = await import("@/hooks/useTtsProvider");
    const states = Object.values(TtsState);
    expect(states).toContain("idle");
    expect(states).toContain("speaking");
    expect(states).toContain("error");
    expect(states).toHaveLength(3);
  });
});
