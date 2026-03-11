import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("getConfiguredProviders", () => {
  const originalEnv = process.env;

  const PROVIDER_ENV_VARS = [
    "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
    "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET",
    "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET",
    "TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET",
    "APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY",
    "NEXT_PUBLIC_BASE_URL",
  ];

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear all provider env vars for hermetic tests
    for (const v of PROVIDER_ENV_VARS) delete process.env[v];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns empty array when no providers configured", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_ID;
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    expect(getConfiguredProviders()).toEqual([]);
  });

  it("returns google when CLIENT_ID, CLIENT_SECRET, and NEXT_PUBLIC_BASE_URL are set", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    const providers = getConfiguredProviders();
    expect(providers).toEqual([
      { id: "google", label: "Google", authUrl: "/api/auth/google" },
    ]);
  });

  it("skips google when NEXT_PUBLIC_BASE_URL is missing", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    delete process.env.NEXT_PUBLIC_BASE_URL;
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    expect(getConfiguredProviders().find(p => p.id === "google")).toBeUndefined();
  });

  it("skips provider when only CLIENT_ID is set (missing SECRET)", async () => {
    process.env.GITHUB_CLIENT_ID = "test-id";
    // GITHUB_CLIENT_SECRET not set
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    expect(getConfiguredProviders()).toEqual([]);
  });

  it("apple requires all 5 env vars (including NEXT_PUBLIC_BASE_URL)", async () => {
    process.env.APPLE_CLIENT_ID = "id";
    process.env.APPLE_TEAM_ID = "team";
    process.env.APPLE_KEY_ID = "key";
    process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
    // APPLE_PRIVATE_KEY not set
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    expect(getConfiguredProviders().find(p => p.id === "apple")).toBeUndefined();

    process.env.APPLE_PRIVATE_KEY = "pk";
    vi.resetModules();
    const { getConfiguredProviders: gcp2 } = await import("@/lib/auth/providers");
    expect(gcp2().find(p => p.id === "apple")).toBeDefined();
  });

  it("returns providers in registry order", async () => {
    process.env.GITHUB_CLIENT_ID = "id";
    process.env.GITHUB_CLIENT_SECRET = "secret";
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    const ids = getConfiguredProviders().map(p => p.id);
    expect(ids.indexOf("google")).toBeLessThan(ids.indexOf("github"));
  });

  it("discord/linkedin/twitter require NEXT_PUBLIC_BASE_URL", async () => {
    process.env.DISCORD_CLIENT_ID = "id";
    process.env.DISCORD_CLIENT_SECRET = "secret";
    delete process.env.NEXT_PUBLIC_BASE_URL;
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    expect(getConfiguredProviders().find(p => p.id === "discord")).toBeUndefined();

    process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
    vi.resetModules();
    const { getConfiguredProviders: gcp2 } = await import("@/lib/auth/providers");
    expect(gcp2().find(p => p.id === "discord")).toBeDefined();
  });
});
