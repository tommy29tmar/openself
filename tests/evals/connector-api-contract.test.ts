import { describe, it, expect } from "vitest";
import { connectorError } from "@/lib/connectors/api-errors";

describe("Connector API Error Contract", () => {
  it("connectorError returns standardized error envelope", async () => {
    const response = connectorError("TEST_CODE", "Test message", 400, false);
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      code: "TEST_CODE",
      error: "Test message",
      retryable: false,
    });
    expect(response.status).toBe(400);
  });

  it("connectorError with retryable=true", async () => {
    const response = connectorError("RETRY_CODE", "Retry message", 429, true);
    const body = await response.json();
    expect(body.retryable).toBe(true);
  });

  it("connectorError sets correct HTTP status codes", async () => {
    const cases = [
      { code: "AUTH_REQUIRED", status: 403, retryable: false },
      { code: "NOT_FOUND", status: 404, retryable: false },
      { code: "INTERNAL", status: 500, retryable: true },
      { code: "RATE_LIMITED", status: 429, retryable: true },
      { code: "ALREADY_SYNCING", status: 409, retryable: true },
    ];

    for (const { code, status, retryable } of cases) {
      const response = connectorError(code, "msg", status, retryable);
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body.code).toBe(code);
      expect(body.retryable).toBe(retryable);
      expect(body.success).toBe(false);
    }
  });

  it("all error fields are present in response", async () => {
    const response = connectorError("SOME_CODE", "Some error", 422, false);
    const body = await response.json();
    const keys = Object.keys(body).sort();
    expect(keys).toEqual(["code", "error", "retryable", "success"]);
  });
});
