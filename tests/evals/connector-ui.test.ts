import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("ConnectorSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("status fetch", () => {
    it("fetches /api/connectors/status on mount", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, connectors: [] }),
      });

      const { getConnectorStatuses } = await import(
        "@/components/settings/ConnectorSection"
      );
      const result = await getConnectorStatuses();

      expect(mockFetch).toHaveBeenCalledWith("/api/connectors/status");
      expect(result).toEqual([]);
    });

    it("returns empty array on fetch failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network"));

      const { getConnectorStatuses } = await import(
        "@/components/settings/ConnectorSection"
      );
      const result = await getConnectorStatuses();

      expect(result).toEqual([]);
    });
  });

  describe("card state derivation", () => {
    it("derives 'not_connected' for missing github connector", async () => {
      const { deriveCardState } = await import(
        "@/components/settings/ConnectorSection"
      );
      const state = deriveCardState("github", []);
      expect(state.connectionState).toBe("not_connected");
    });

    it("derives 'connected' for active github connector", async () => {
      const { deriveCardState } = await import(
        "@/components/settings/ConnectorSection"
      );
      const state = deriveCardState("github", [
        {
          id: "c1",
          connectorType: "github",
          status: "connected",
          enabled: true,
          lastSync: "2026-03-01T12:00:00Z",
          lastError: null,
          createdAt: "2026-03-01T10:00:00Z",
          updatedAt: "2026-03-01T12:00:00Z",
        },
      ]);
      expect(state.connectionState).toBe("connected");
      expect(state.lastSync).toBe("2026-03-01T12:00:00Z");
    });

    it("derives 'error' for connector with error status", async () => {
      const { deriveCardState } = await import(
        "@/components/settings/ConnectorSection"
      );
      const state = deriveCardState("github", [
        {
          id: "c1",
          connectorType: "github",
          status: "error",
          enabled: true,
          lastSync: null,
          lastError: "Token expired",
          createdAt: "2026-03-01T10:00:00Z",
          updatedAt: "2026-03-01T12:00:00Z",
        },
      ]);
      expect(state.connectionState).toBe("error");
      expect(state.lastError).toBe("Token expired");
    });

    it("derives 'not_connected' for disconnected connector", async () => {
      const { deriveCardState } = await import(
        "@/components/settings/ConnectorSection"
      );
      const state = deriveCardState("github", [
        {
          id: "c1",
          connectorType: "github",
          status: "disconnected",
          enabled: true,
          lastSync: null,
          lastError: null,
          createdAt: "2026-03-01T10:00:00Z",
          updatedAt: "2026-03-01T12:00:00Z",
        },
      ]);
      expect(state.connectionState).toBe("not_connected");
    });
  });
});
