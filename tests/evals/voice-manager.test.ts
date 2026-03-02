import { describe, it, expect } from "vitest";

describe("VoiceState enum", () => {
  it("has all required states", async () => {
    const { VoiceState } = await import("@/hooks/useVoiceManager");
    expect(VoiceState.IDLE).toBe("idle");
    expect(VoiceState.LISTENING).toBe("listening");
    expect(VoiceState.TRANSCRIBING).toBe("transcribing");
    expect(VoiceState.WAITING).toBe("waiting");
    expect(VoiceState.SPEAKING).toBe("speaking");
    expect(VoiceState.ERROR).toBe("error");
    expect(VoiceState.PERMISSION_DENIED).toBe("permission_denied");
    expect(VoiceState.UNAVAILABLE).toBe("unavailable");
  });
});
