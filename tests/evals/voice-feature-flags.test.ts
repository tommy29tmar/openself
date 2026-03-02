import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("voice feature flags", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it("isVoiceEnabled returns false by default", async () => {
    delete process.env.NEXT_PUBLIC_VOICE_ENABLED;
    const { isVoiceEnabled } = await import("@/lib/voice/feature-flags");
    expect(isVoiceEnabled()).toBe(false);
  });

  it("isVoiceEnabled returns true when env is 'true'", async () => {
    process.env.NEXT_PUBLIC_VOICE_ENABLED = "true";
    const { isVoiceEnabled } = await import("@/lib/voice/feature-flags");
    expect(isVoiceEnabled()).toBe(true);
  });

  it("isServerSttEnabled returns false by default", async () => {
    delete process.env.NEXT_PUBLIC_VOICE_STT_SERVER_FALLBACK_ENABLED;
    const { isServerSttEnabled } = await import("@/lib/voice/feature-flags");
    expect(isServerSttEnabled()).toBe(false);
  });

  it("isServerSttEnabled returns true when env is 'true'", async () => {
    process.env.NEXT_PUBLIC_VOICE_STT_SERVER_FALLBACK_ENABLED = "true";
    const { isServerSttEnabled } = await import("@/lib/voice/feature-flags");
    expect(isServerSttEnabled()).toBe(true);
  });
});
