import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PageConfig } from "@/lib/page-config/schema";

// Mock state
let mockMultiUser = true;
let mockScope: Record<string, unknown> | null = null;
let mockAuthCtx: { userId?: string; username?: string | null; profileId?: string } | null = null;
let mockDraft: { config: PageConfig; username: string; status: string; configHash: string | null; updatedAt: string | null } | null = null;
let lastRequestPublishArgs: { username: string; sessionId: string } | null = null;
let mockUsernameTaken = false;

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: () => mockMultiUser,
  isUsernameTaken: () => mockUsernameTaken,
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: () => mockScope,
  getAuthContext: () => mockAuthCtx,
}));

vi.mock("@/lib/services/page-service", () => ({
  getDraft: () => mockDraft,
  requestPublish: (username: string, sessionId: string) => {
    lastRequestPublishArgs = { username, sessionId };
  },
}));

const { POST } = await import("@/app/api/draft/request-publish/route");

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/draft/request-publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_CONFIG: PageConfig = {
  version: 1,
  username: "draft",
  theme: "minimal",
  style: { colorScheme: "light", primaryColor: "#6366f1", fontFamily: "inter", layout: "centered" },
  sections: [
    { id: "hero-1", type: "hero", content: { name: "Test", tagline: "Hi" } },
    { id: "footer-1", type: "footer", content: {} },
  ],
};

describe("POST /api/draft/request-publish", () => {
  beforeEach(() => {
    mockMultiUser = true;
    mockScope = {
      cognitiveOwnerKey: "owner-1",
      knowledgeReadKeys: ["session-1"],
      knowledgePrimaryKey: "session-1",
      currentSessionId: "session-1",
    };
    mockAuthCtx = { userId: "user-1", username: "alice", profileId: "profile-1" };
    mockDraft = { config: VALID_CONFIG, username: "draft", status: "draft", configHash: null, updatedAt: null };
    lastRequestPublishArgs = null;
    mockUsernameTaken = false;
  });

  it("returns 403 for anonymous requests (no scope)", async () => {
    mockScope = null;
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("AUTH_REQUIRED");
  });

  it("returns 403 for unauthenticated requests (no userId)", async () => {
    mockAuthCtx = null;
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("AUTH_REQUIRED");
  });

  it("uses authCtx.username when available, ignores body.username", async () => {
    mockAuthCtx = { userId: "user-1", username: "alice", profileId: "profile-1" };
    const res = await POST(makeRequest({ username: "bob" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.username).toBe("alice");
    expect(lastRequestPublishArgs?.username).toBe("alice");
  });

  it("accepts body.username when authCtx.username is null (OAuth edge case)", async () => {
    mockAuthCtx = { userId: "user-1", username: null, profileId: "profile-1" };
    const res = await POST(makeRequest({ username: "bob" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.username).toBe("bob");
  });

  it("returns 400 for reserved username (OAuth edge case)", async () => {
    mockAuthCtx = { userId: "user-1", username: null, profileId: "profile-1" };
    const res = await POST(makeRequest({ username: "admin" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("USERNAME_RESERVED");
  });

  it("returns 400 for invalid username format (OAuth edge case)", async () => {
    mockAuthCtx = { userId: "user-1", username: null, profileId: "profile-1" };
    const res = await POST(makeRequest({ username: "INVALID!" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("USERNAME_INVALID");
  });

  it("returns 409 for taken username (OAuth edge case)", async () => {
    mockAuthCtx = { userId: "user-1", username: null, profileId: "profile-1" };
    mockUsernameTaken = true;
    const res = await POST(makeRequest({ username: "taken" }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("USERNAME_TAKEN");
  });

  it("returns 400 when no draft exists", async () => {
    mockDraft = null;
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("NO_DRAFT");
  });

  it("calls requestPublish with correct args on success", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    expect(lastRequestPublishArgs).toEqual({
      username: "alice",
      sessionId: "session-1",
    });
  });
});
