import { describe, it, expect } from "vitest";

describe("STT provider types", () => {
  it("SttResult has text and isFinal fields", async () => {
    const { isSttResult } = await import("@/hooks/useSttProvider");
    expect(isSttResult({ text: "hello", isFinal: true })).toBe(true);
    expect(isSttResult({ text: "", isFinal: false })).toBe(true);
    expect(isSttResult({ text: 123 })).toBe(false);
    expect(isSttResult(null)).toBe(false);
  });

  it("VoiceSttState enum values are correct", async () => {
    const { VoiceSttState } = await import("@/hooks/useSttProvider");
    expect(VoiceSttState.IDLE).toBe("idle");
    expect(VoiceSttState.LISTENING).toBe("listening");
    expect(VoiceSttState.TRANSCRIBING).toBe("transcribing");
    expect(VoiceSttState.ERROR).toBe("error");
    expect(VoiceSttState.PERMISSION_DENIED).toBe("permission_denied");
  });
});
