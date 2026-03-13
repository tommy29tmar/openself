import { describe, it, expect, vi, afterEach } from "vitest";
import { preflightConnectCheck } from "@/lib/connectors/preflight";

describe("preflightConnectCheck", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns error when endpoint returns NOT_CONFIGURED (404)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          success: false,
          code: "NOT_CONFIGURED",
          error: "Spotify OAuth not configured.",
          retryable: false,
        }),
    });

    const result = await preflightConnectCheck("/api/connectors/spotify/connect");
    expect(result).toEqual({ ok: false, error: "Spotify OAuth not configured." });
  });

  it("returns error when endpoint returns AUTH_REQUIRED (403)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          success: false,
          code: "AUTH_REQUIRED",
          error: "Authentication required.",
          retryable: false,
        }),
    });

    const result = await preflightConnectCheck("/api/connectors/spotify/connect");
    expect(result).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns ok when fetch throws (CORS redirect to OAuth provider)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await preflightConnectCheck("/api/connectors/spotify/connect");
    expect(result).toEqual({ ok: true });
  });

  it("returns ok when endpoint returns a successful response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const result = await preflightConnectCheck("/api/connectors/spotify/connect");
    expect(result).toEqual({ ok: true });
  });

  it("returns generic error when json parsing fails on error response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("invalid json")),
    });

    const result = await preflightConnectCheck("/api/connectors/spotify/connect");
    expect(result).toEqual({ ok: false, error: "Connection failed" });
  });
});
