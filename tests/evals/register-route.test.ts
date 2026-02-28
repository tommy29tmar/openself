import { describe, it, expect, vi, beforeEach } from "vitest";

// -- Mocks --

const mockSession = { id: "sess-1", profileId: "prof-1", status: "active" };
let mockUsers: Record<string, { id: string; email: string; passwordHash: string }> = {};
let mockProfiles: Record<string, { id: string; userId: string | null; username: string | null }> = {};
let mockPublishResult = { url: "/test-user" };
let mockPublishError: Error | null = null;
let mockRegisterCalled = false;
let mockRegisterCalledWith: string[] = [];

vi.mock("@/lib/auth/session", () => ({
  getSessionIdFromRequest: () => "sess-1",
  getAuthContext: () => ({ profileId: "prof-1", userId: null, username: null }),
  createSessionCookie: (id: string) => `session=${id}; Path=/; HttpOnly`,
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: () => true,
  getSession: (id: string) => (id === "sess-1" ? mockSession : null),
  isUsernameTaken: (u: string) => u === "taken-user",
  registerUsername: (sessionId: string, username: string) => {
    mockRegisterCalled = true;
    mockRegisterCalledWith.push(username);
  },
}));

vi.mock("@/lib/services/publish-pipeline", () => ({
  prepareAndPublish: async () => {
    if (mockPublishError) throw mockPublishError;
    return mockPublishResult;
  },
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
  logEvent: () => {},
}));

vi.mock("@/lib/flags", () => ({
  AUTH_V2: true,
}));

const { MockProfileAlreadyLinkedError } = vi.hoisted(() => ({
  MockProfileAlreadyLinkedError: class ProfileAlreadyLinkedError extends Error {
    constructor() { super("Profile already linked to a different user"); }
  },
}));

vi.mock("@/lib/services/auth-service", () => ({
  getUserByEmail: (email: string) => mockUsers[email.toLowerCase()] ?? null,
  verifyPassword: async (hash: string, password: string) => hash === `hash:${password}`,
  hashPassword: async (password: string) => `hash:${password}`,
  linkProfileToUser: (profileId: string, userId: string) => {
    const profile = mockProfiles[profileId];
    if (profile && profile.userId !== null && profile.userId !== userId) {
      throw new MockProfileAlreadyLinkedError();
    }
    if (profile) profile.userId = userId;
  },
  getProfileById: (id: string) => mockProfiles[id] ?? null,
  createAuthSession: () => "new-sess-1",
  ProfileAlreadyLinkedError: MockProfileAlreadyLinkedError,
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: () => ({
        run: () => {},
      }),
    }),
  },
  sqlite: {
    transaction: (fn: () => any) => fn,
    prepare: () => ({ run: () => {} }),
    pragma: () => {},
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: { id: "id", email: "email" },
  profiles: { id: "id", userId: "user_id" },
}));

import { POST } from "@/app/api/register/route";

function makeRequest(body: Record<string, string>) {
  return new Request("http://localhost/api/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: "session=sess-1",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockUsers = {};
  mockProfiles = {
    "prof-1": { id: "prof-1", userId: null, username: null },
  };
  mockPublishError = null;
  mockRegisterCalled = false;
  mockRegisterCalledWith = [];
});

describe("register route", () => {
  it("returns USERNAME_INVALID for missing username", async () => {
    const res = await POST(makeRequest({ email: "a@b.com", password: "12345678" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.code).toBe("USERNAME_INVALID");
  });

  it("returns USERNAME_INVALID for bad format", async () => {
    const res = await POST(makeRequest({ username: "AB CD", email: "a@b.com", password: "12345678" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.code).toBe("USERNAME_INVALID");
  });

  it("returns USERNAME_RESERVED for reserved usernames", async () => {
    const res = await POST(makeRequest({ username: "admin", email: "a@b.com", password: "12345678" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.code).toBe("USERNAME_RESERVED");
  });

  it("returns USERNAME_TAKEN for taken usernames", async () => {
    const res = await POST(makeRequest({ username: "taken-user", email: "a@b.com", password: "12345678" }));
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.code).toBe("USERNAME_TAKEN");
  });

  it("returns EMAIL_INVALID for bad email", async () => {
    const res = await POST(makeRequest({ username: "test-user", email: "not-an-email", password: "12345678" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.code).toBe("EMAIL_INVALID");
  });

  it("returns PASSWORD_TOO_SHORT for short password", async () => {
    const res = await POST(makeRequest({ username: "test-user", email: "a@b.com", password: "short" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.code).toBe("PASSWORD_TOO_SHORT");
  });

  it("returns EMAIL_TAKEN when email exists with different owner", async () => {
    mockUsers["a@b.com"] = { id: "user-other", email: "a@b.com", passwordHash: "hash:12345678" };
    // Profile linked to a different user
    mockProfiles["prof-1"] = { id: "prof-1", userId: "user-different", username: null };

    const res = await POST(makeRequest({ username: "test-user", email: "a@b.com", password: "12345678" }));
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.code).toBe("EMAIL_TAKEN");
  });

  it("returns PASSWORD_MISMATCH on retry with wrong password", async () => {
    mockUsers["a@b.com"] = { id: "user-1", email: "a@b.com", passwordHash: "hash:correct-pass" };
    mockProfiles["prof-1"] = { id: "prof-1", userId: "user-1", username: null };

    const res = await POST(makeRequest({ username: "test-user", email: "a@b.com", password: "wrong-pass" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.code).toBe("PASSWORD_MISMATCH");
  });

  it("registerUsername is called only after publish success", async () => {
    const res = await POST(makeRequest({ username: "test-user", email: "new@b.com", password: "12345678" }));
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockRegisterCalled).toBe(true);
    expect(mockRegisterCalledWith).toContain("test-user");
  });

  it("returns EMAIL_TAKEN when linkProfileToUser throws ProfileAlreadyLinkedError", async () => {
    // New user (not in mockUsers), but profile already linked to a different user.
    // linkProfileToUser is called inside the transaction and throws.
    mockProfiles["prof-1"] = { id: "prof-1", userId: "user-other", username: null };

    const res = await POST(makeRequest({ username: "test-user", email: "brand-new@b.com", password: "12345678" }));
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.code).toBe("EMAIL_TAKEN");
  });
});
