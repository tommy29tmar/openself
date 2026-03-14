import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * usePreviewSync — transport-only hook.
 *
 * Tests cover the polling fallback path only (fetch is mockable).
 * SSE behavior is verified via integration tests or manual testing —
 * EventSource does not exist in jsdom/happy-dom test environments.
 */

// We test the internal helpers and the polling logic without React.
// The hook itself is thin React glue; the transport logic is what matters.

describe("usePreviewSync", () => {
  describe("polling transport", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.useFakeTimers();
      fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("calls onUpdate with parsed preview data on successful poll", async () => {
      const mockData = {
        config: { sections: [], surface: "clay", voice: "narrative", light: "night", layoutTemplate: "sidebar-left" },
        configHash: "abc123",
        publishStatus: "draft",
      };
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockData), { status: 200 }),
      );

      // Import after mocking
      const { pollPreview } = await import("@/hooks/usePreviewSync");

      const onUpdate = vi.fn();
      await pollPreview({ language: "en", onUpdate });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/preview?username=draft&language=en"),
      );
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({
        config: mockData.config,
        configHash: "abc123",
        publishStatus: "draft",
        surface: "clay",
        voice: "narrative",
        light: "night",
        layoutTemplate: "sidebar-left",
        username: undefined,
      });
    });

    it("does not call onUpdate when response has no config", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      const { pollPreview } = await import("@/hooks/usePreviewSync");

      const onUpdate = vi.fn();
      await pollPreview({ language: "it", onUpdate });

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("does not call onUpdate on fetch error", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("Network failure"));

      const { pollPreview } = await import("@/hooks/usePreviewSync");

      const onUpdate = vi.fn();
      await pollPreview({ language: "en", onUpdate });

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("does not call onUpdate on non-ok response", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response("Server Error", { status: 500 }),
      );

      const { pollPreview } = await import("@/hooks/usePreviewSync");

      const onUpdate = vi.fn();
      await pollPreview({ language: "en", onUpdate });

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("redirects to /invite on 401", async () => {
      // Set up a minimal window.location mock for Node test environment
      const locationMock = { href: "" } as Location;
      const origWindow = globalThis.window;
      // @ts-expect-error — minimal mock
      globalThis.window = { location: locationMock };

      fetchSpy.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 }),
      );

      const { pollPreview } = await import("@/hooks/usePreviewSync");

      const onUpdate = vi.fn();
      await pollPreview({ language: "en", onUpdate });

      expect(onUpdate).not.toHaveBeenCalled();
      expect(locationMock.href).toBe("/invite");

      // Restore
      globalThis.window = origWindow;
    });

    it("extracts username from config when present", async () => {
      const mockData = {
        config: { sections: [], surface: "canvas", voice: "signal", light: "day", username: "mario" },
        configHash: "def456",
        publishStatus: "published",
      };
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockData), { status: 200 }),
      );

      const { pollPreview } = await import("@/hooks/usePreviewSync");

      const onUpdate = vi.fn();
      await pollPreview({ language: "en", onUpdate });

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          username: "mario",
          surface: "canvas",
          voice: "signal",
          light: "day",
        }),
      );
    });
  });

  describe("POLL_INTERVAL export", () => {
    it("exports a numeric interval", async () => {
      const { POLL_INTERVAL } = await import("@/hooks/usePreviewSync");
      expect(typeof POLL_INTERVAL).toBe("number");
      expect(POLL_INTERVAL).toBeGreaterThan(0);
    });
  });
});
