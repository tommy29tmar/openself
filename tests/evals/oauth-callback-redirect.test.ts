import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("buildCallbackRedirectUrl", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("uses NEXT_PUBLIC_BASE_URL when set", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
    const { buildCallbackRedirectUrl } = await import("@/lib/connectors/redirect-helper");
    const url = buildCallbackRedirectUrl("/builder?connector=github_connected");
    expect(url.origin).toBe("https://openself.dev");
    expect(url.pathname).toBe("/builder");
    expect(url.searchParams.get("connector")).toBe("github_connected");
  });

  it("falls back to localhost:3000 when env not set", async () => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    const { buildCallbackRedirectUrl } = await import("@/lib/connectors/redirect-helper");
    const url = buildCallbackRedirectUrl("/builder?error=test");
    expect(url.origin).toBe("http://localhost:3000");
  });

  it("never produces 0.0.0.0 in the URL", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
    const { buildCallbackRedirectUrl } = await import("@/lib/connectors/redirect-helper");
    const url = buildCallbackRedirectUrl("/builder?connector=test");
    expect(url.toString()).not.toContain("0.0.0.0");
  });
});
