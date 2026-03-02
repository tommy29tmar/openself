import { describe, it, expect } from "vitest";

describe("TTS provider types", () => {
  it("TtsState enum values are correct", async () => {
    const { TtsState } = await import("@/hooks/useTtsProvider");
    expect(TtsState.IDLE).toBe("idle");
    expect(TtsState.SPEAKING).toBe("speaking");
    expect(TtsState.ERROR).toBe("error");
  });
});
