import { beforeEach, describe, expect, it, vi } from "vitest";

let mockScope: Record<string, unknown> | null = null;
let mockAuthCtx:
  | {
      sessionId: string;
      profileId: string;
      userId: string | null;
      username: string | null;
    }
  | null = null;
let mockValidationResult:
  | { ok: true }
  | { ok: false; code: string; message: string } = { ok: true };
const mockPrepareAndPublish = vi.fn(async (..._: any[]) => ({
  success: true as const,
  username: "alice",
  url: "/alice",
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: () => mockScope,
  getAuthContext: () => mockAuthCtx,
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: () => true,
}));

vi.mock("@/lib/services/username-validation", () => ({
  validateUsernameAvailability: () => mockValidationResult,
}));

vi.mock("@/lib/services/publish-pipeline", () => ({
  prepareAndPublish: (...args: any[]) => mockPrepareAndPublish(...args),
  PublishError: class PublishError extends Error {
    code: string;
    httpStatus: number;
    constructor(message: string, code: string, httpStatus: number) {
      super(message);
      this.code = code;
      this.httpStatus = httpStatus;
    }
  },
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

const { POST } = await import("@/app/api/publish/route");

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/publish username validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScope = {
      cognitiveOwnerKey: "profile-1",
      knowledgeReadKeys: ["session-1"],
      knowledgePrimaryKey: "session-1",
      currentSessionId: "session-1",
    };
    mockAuthCtx = {
      sessionId: "session-1",
      profileId: "profile-1",
      userId: "user-1",
      username: null,
    };
    mockValidationResult = { ok: true };
  });

  it("rejects reserved username in OAuth first-publish path", async () => {
    mockValidationResult = {
      ok: false,
      code: "USERNAME_RESERVED",
      message: '"login" is reserved.',
    };

    const response = await POST(makeRequest({ username: "login" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("USERNAME_RESERVED");
    expect(mockPrepareAndPublish).not.toHaveBeenCalled();
  });

  it("rejects taken username in OAuth first-publish path", async () => {
    mockValidationResult = {
      ok: false,
      code: "USERNAME_TAKEN",
      message: "Username already taken.",
    };

    const response = await POST(makeRequest({ username: "alice" }));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("USERNAME_TAKEN");
    expect(mockPrepareAndPublish).not.toHaveBeenCalled();
  });
});
