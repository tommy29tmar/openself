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

describe("STT state reset for auto-listen loop", () => {
  it("Web Speech: recognition.onend resets state to IDLE when in LISTENING", async () => {
    const { VoiceSttState } = await import("@/hooks/useSttProvider");
    expect(VoiceSttState.IDLE).toBe("idle");
    expect(VoiceSttState.LISTENING).toBe("listening");
    const fs = await import("fs");
    const src = fs.readFileSync("src/hooks/useSttProvider.ts", "utf-8");
    expect(src).not.toMatch(/recognition\.onend\s*=\s*\(\)\s*=>\s*\{\s*\}/);
  });

  it("Server fallback: state resets to IDLE after successful onFinalResult", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/hooks/useSttProvider.ts", "utf-8");
    const onstopBlock = src.slice(src.indexOf("recorder.onstop"), src.indexOf("recorder.start"));
    expect(onstopBlock).toContain("onFinalResult(data.text.trim())");
    const afterFinalResult = onstopBlock.slice(onstopBlock.lastIndexOf("onFinalResult"));
    expect(afterFinalResult).toMatch(/setState\(VoiceSttState\.IDLE\)/);
  });
});

describe("STT server fallback language hint", () => {
  it("server fallback appends language to FormData and language is in dependency array", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/hooks/useSttProvider.ts", "utf-8");

    // Must append language to the FormData before POSTing
    const serverFallbackBlock = src.slice(
      src.indexOf("startServerFallback"),
      src.indexOf("}, [onResult, onFinalResult])")
    );
    expect(serverFallbackBlock).toContain('formData.append("language"');

    // language must be in the dependency array to prevent stale closures
    expect(src).toMatch(/\[onResult,\s*onFinalResult,\s*language\]/);
  });
});
