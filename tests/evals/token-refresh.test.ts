import { describe, it, expect, vi, beforeEach } from "vitest";
import { withTokenRefresh, TokenExpiredError } from "@/lib/connectors/token-refresh";

// Mock the connector-service module
vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorWithCredentials: vi.fn(),
  updateConnectorCredentials: vi.fn(),
}));

import {
  getConnectorWithCredentials,
  updateConnectorCredentials,
} from "@/lib/connectors/connector-service";

const mockGetConnector = vi.mocked(getConnectorWithCredentials);
const mockUpdateCredentials = vi.mocked(updateConnectorCredentials);

const CONNECTOR_ID = "test-connector-id";

const makeConnector = (accessToken = "access-token-1", refreshToken = "refresh-token-1") => ({
  id: CONNECTOR_ID,
  ownerKey: "owner-key",
  connectorType: "spotify",
  status: "connected" as const,
  enabled: true,
  credentials: "encrypted",
  config: null,
  lastSync: null,
  lastError: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  decryptedCredentials: {
    access_token: accessToken,
    refresh_token: refreshToken,
  },
});

describe("withTokenRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("succeeds on first attempt without triggering a refresh", async () => {
    mockGetConnector.mockReturnValue(makeConnector());
    const apiFn = vi.fn().mockResolvedValue({ data: "ok" });
    const refreshFn = vi.fn();

    const result = await withTokenRefresh(CONNECTOR_ID, refreshFn, apiFn);

    expect(result).toEqual({ data: "ok" });
    expect(apiFn).toHaveBeenCalledOnce();
    expect(apiFn).toHaveBeenCalledWith("access-token-1");
    expect(refreshFn).not.toHaveBeenCalled();
    expect(mockUpdateCredentials).not.toHaveBeenCalled();
  });

  it("refreshes token on TokenExpiredError and retries with new token", async () => {
    mockGetConnector.mockReturnValue(makeConnector("old-access-token", "my-refresh-token"));

    const apiFn = vi.fn()
      .mockRejectedValueOnce(new TokenExpiredError())
      .mockResolvedValueOnce({ data: "retried-ok" });

    const refreshFn = vi.fn().mockResolvedValue({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 3600,
    });

    const result = await withTokenRefresh(CONNECTOR_ID, refreshFn, apiFn);

    expect(result).toEqual({ data: "retried-ok" });
    expect(apiFn).toHaveBeenCalledTimes(2);
    expect(apiFn).toHaveBeenNthCalledWith(1, "old-access-token");
    expect(apiFn).toHaveBeenNthCalledWith(2, "new-access-token");
    expect(refreshFn).toHaveBeenCalledOnce();
    expect(refreshFn).toHaveBeenCalledWith("my-refresh-token");
    expect(mockUpdateCredentials).toHaveBeenCalledOnce();
    expect(mockUpdateCredentials).toHaveBeenCalledWith(CONNECTOR_ID, {
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 3600,
    });
  });

  it("throws on second TokenExpiredError after refresh (does not retry again)", async () => {
    mockGetConnector.mockReturnValue(makeConnector("old-access-token", "my-refresh-token"));

    const apiFn = vi.fn()
      .mockRejectedValueOnce(new TokenExpiredError())
      .mockRejectedValueOnce(new TokenExpiredError());

    const refreshFn = vi.fn().mockResolvedValue({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
    });

    await expect(
      withTokenRefresh(CONNECTOR_ID, refreshFn, apiFn),
    ).rejects.toThrow(TokenExpiredError);

    expect(apiFn).toHaveBeenCalledTimes(2);
    expect(refreshFn).toHaveBeenCalledOnce();
    // Credentials were still updated before the retry
    expect(mockUpdateCredentials).toHaveBeenCalledOnce();
  });

  it("throws immediately on non-TokenExpiredError without refreshing", async () => {
    mockGetConnector.mockReturnValue(makeConnector());

    const networkError = new Error("Network timeout");
    const apiFn = vi.fn().mockRejectedValue(networkError);
    const refreshFn = vi.fn();

    await expect(
      withTokenRefresh(CONNECTOR_ID, refreshFn, apiFn),
    ).rejects.toThrow("Network timeout");

    expect(refreshFn).not.toHaveBeenCalled();
    expect(mockUpdateCredentials).not.toHaveBeenCalled();
  });

  it("throws when connector has no credentials", async () => {
    mockGetConnector.mockReturnValue(null);
    const apiFn = vi.fn();
    const refreshFn = vi.fn();

    await expect(
      withTokenRefresh(CONNECTOR_ID, refreshFn, apiFn),
    ).rejects.toThrow("No credentials for connector");

    expect(apiFn).not.toHaveBeenCalled();
  });
});
