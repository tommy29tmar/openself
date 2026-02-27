import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSqlitePrepare = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {},
  sqlite: { prepare: (...args: unknown[]) => mockSqlitePrepare(...args) },
}));

vi.mock("@/lib/services/session-service", () => ({
  DEFAULT_SESSION_ID: "__default__",
  isMultiUserEnabled: () => true,
  getSession: vi.fn(),
}));

import { resolveOwnerScopeForWorker } from "@/lib/auth/session";

describe("resolveOwnerScopeForWorker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves authenticated owner (profileId → session IDs)", () => {
    mockSqlitePrepare.mockImplementation((sql: string) => {
      if (sql.includes("ORDER BY")) {
        return { get: () => ({ id: "session-oldest" }) };
      }
      return { all: () => [{ id: "session-oldest" }, { id: "session-new" }] };
    });
    const scope = resolveOwnerScopeForWorker("profile-123");
    expect(scope.cognitiveOwnerKey).toBe("profile-123");
    expect(scope.knowledgeReadKeys).toEqual(["session-oldest", "session-new"]);
    expect(scope.knowledgePrimaryKey).toBe("session-oldest");
  });

  it("resolves anonymous owner (ownerKey = sessionId)", () => {
    mockSqlitePrepare.mockImplementation(() => ({
      all: () => [],
      get: () => undefined,
    }));
    const scope = resolveOwnerScopeForWorker("anon-session-xyz");
    expect(scope.cognitiveOwnerKey).toBe("anon-session-xyz");
    expect(scope.knowledgeReadKeys).toEqual(["anon-session-xyz"]);
    expect(scope.knowledgePrimaryKey).toBe("anon-session-xyz");
  });
});
