import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---

const mockResolveAuthenticatedConnectorScope = vi.fn();
const mockCreateConnector = vi.fn();
const mockEnqueueJob = vi.fn();

const mockCreateAuthorizationURL = vi.fn().mockReturnValue("https://github.com/login/oauth/authorize?state=test");
const mockValidateAuthorizationCode = vi.fn().mockResolvedValue({ accessToken: () => "ghp_test123" });
const mockGenerateState = vi.fn().mockReturnValue("test-state");

vi.mock("arctic", () => {
  function MockGitHub() {
    return {
      createAuthorizationURL: mockCreateAuthorizationURL,
      validateAuthorizationCode: mockValidateAuthorizationCode,
    };
  }
  return {
    GitHub: MockGitHub,
    generateState: (...args: any[]) => mockGenerateState(...args),
  };
});

vi.mock("@/lib/connectors/route-auth", () => ({
  resolveAuthenticatedConnectorScope: (...args: any[]) =>
    mockResolveAuthenticatedConnectorScope(...args),
}));

vi.mock("@/lib/connectors/connector-service", () => ({
  createConnector: (...args: any[]) => mockCreateConnector(...args),
}));

vi.mock("@/lib/worker", () => ({
  enqueueJob: (...args: any[]) => mockEnqueueJob(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  sqlite: {},
}));

vi.mock("@/lib/db/schema", () => ({
  connectors: {},
  jobs: {},
}));

const ownerScope = {
  cognitiveOwnerKey: "owner-1",
  knowledgePrimaryKey: "sess-1",
  knowledgeReadKeys: ["sess-1"],
  currentSessionId: "sess-1",
};

const savedEnv = { ...process.env };

describe("GET /api/connectors/github/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
    process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("returns 403 when no session", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(null);

    const { GET } = await import("@/app/api/connectors/github/connect/route");
    const req = new NextRequest(new Request("http://localhost/api/connectors/github/connect"));
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("AUTH_REQUIRED");
  });

  it("returns 404 when GitHub OAuth env vars not configured", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;

    const { GET } = await import("@/app/api/connectors/github/connect/route");
    const req = new NextRequest(new Request("http://localhost/api/connectors/github/connect"));
    const res = await GET(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NOT_CONFIGURED");
  });

  it("returns 404 when NEXT_PUBLIC_BASE_URL not set", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);
    delete process.env.NEXT_PUBLIC_BASE_URL;

    const { GET } = await import("@/app/api/connectors/github/connect/route");
    const req = new NextRequest(new Request("http://localhost/api/connectors/github/connect"));
    const res = await GET(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NOT_CONFIGURED");
  });

  it("redirects to GitHub with read:user scope and connector callback URL", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);

    const { GET } = await import("@/app/api/connectors/github/connect/route");
    const req = new NextRequest(new Request("http://localhost/api/connectors/github/connect"));
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://github.com/login/oauth/authorize?state=test");
    expect(mockCreateAuthorizationURL).toHaveBeenCalledWith("test-state", ["read:user"]);
  });

  it("sets gh_connector_state cookie on redirect", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);

    const { GET } = await import("@/app/api/connectors/github/connect/route");
    const req = new NextRequest(new Request("http://localhost/api/connectors/github/connect"));
    const res = await GET(req);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("gh_connector_state=test-state");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Max-Age=600");
  });
});

describe("GET /api/auth/github/callback/connector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
    process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("redirects to /builder?error=auth_required when no session", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(null);

    const { GET } = await import("@/app/api/auth/github/callback/connector/route");
    const req = new NextRequest(
      new Request("http://localhost/api/auth/github/callback/connector?code=abc&state=test-state"),
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/builder");
    expect(location.searchParams.get("error")).toBe("auth_required");
  });

  it("redirects to /builder?error=invalid_state when state mismatch", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);

    const { GET } = await import("@/app/api/auth/github/callback/connector/route");
    const req = new NextRequest(
      new Request("http://localhost/api/auth/github/callback/connector?code=abc&state=wrong-state", {
        headers: { Cookie: "gh_connector_state=correct-state" },
      }),
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/builder");
    expect(location.searchParams.get("error")).toBe("invalid_state");
  });

  it("redirects to /builder?error=invalid_state when code is missing", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);

    const { GET } = await import("@/app/api/auth/github/callback/connector/route");
    const req = new NextRequest(
      new Request("http://localhost/api/auth/github/callback/connector?state=test-state", {
        headers: { Cookie: "gh_connector_state=test-state" },
      }),
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("invalid_state");
  });

  it("redirects to /builder?error=invalid_state when stored state cookie is missing", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);

    const { GET } = await import("@/app/api/auth/github/callback/connector/route");
    const req = new NextRequest(
      new Request("http://localhost/api/auth/github/callback/connector?code=abc&state=test-state"),
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("invalid_state");
  });

  it("exchanges code, creates connector, and enqueues sync job on success", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);

    const { GET } = await import("@/app/api/auth/github/callback/connector/route");
    const req = new NextRequest(
      new Request("http://localhost/api/auth/github/callback/connector?code=auth-code-123&state=test-state", {
        headers: { Cookie: "gh_connector_state=test-state" },
      }),
    );
    const res = await GET(req);

    expect(mockValidateAuthorizationCode).toHaveBeenCalledWith("auth-code-123");
    expect(mockCreateConnector).toHaveBeenCalledWith(
      "owner-1",
      "github",
      { access_token: "ghp_test123" },
      {},
    );
    expect(mockEnqueueJob).toHaveBeenCalledWith("connector_sync", { ownerKey: "owner-1" });
  });

  it("redirects to /builder?connector=github_connected on success", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);

    const { GET } = await import("@/app/api/auth/github/callback/connector/route");
    const req = new NextRequest(
      new Request("http://localhost/api/auth/github/callback/connector?code=abc&state=test-state", {
        headers: { Cookie: "gh_connector_state=test-state" },
      }),
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/builder");
    expect(location.searchParams.get("connector")).toBe("github_connected");
  });

  it("clears gh_connector_state cookie on success", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);

    const { GET } = await import("@/app/api/auth/github/callback/connector/route");
    const req = new NextRequest(
      new Request("http://localhost/api/auth/github/callback/connector?code=abc&state=test-state", {
        headers: { Cookie: "gh_connector_state=test-state" },
      }),
    );
    const res = await GET(req);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("gh_connector_state");
    // Deleted cookies have Max-Age=0 or expire in the past
    expect(setCookie).toMatch(/Max-Age=0|expires=.*1970/i);
  });

  it("redirects to /builder?error=github_connect_failed on token exchange error", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);
    mockValidateAuthorizationCode.mockRejectedValueOnce(new Error("Token exchange failed"));

    const { GET } = await import("@/app/api/auth/github/callback/connector/route");
    const req = new NextRequest(
      new Request("http://localhost/api/auth/github/callback/connector?code=bad-code&state=test-state", {
        headers: { Cookie: "gh_connector_state=test-state" },
      }),
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/builder");
    expect(location.searchParams.get("error")).toBe("github_connect_failed");
    expect(mockCreateConnector).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });
});
