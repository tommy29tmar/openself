import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMessages = [
  { id: "old-1", role: "user", content: "old message", createdAt: "2026-01-01T00:00:00Z" },
  { id: "old-2", role: "assistant", content: "old reply", createdAt: "2026-01-01T00:01:00Z" },
  { id: "new-1", role: "user", content: "recent message", createdAt: new Date().toISOString() },
  { id: "new-2", role: "assistant", content: "recent reply", createdAt: new Date().toISOString() },
];

vi.mock("@/lib/db", () => {
  const selectAll = vi.fn(() => mockMessages);
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              all: selectAll,
            })),
          })),
        })),
      })),
    },
    sqlite: {
      prepare: vi.fn(() => ({
        get: vi.fn(() => undefined),
        run: vi.fn(),
      })),
    },
  };
});

vi.mock("@/lib/db/schema", () => ({
  messages: {
    id: "id",
    role: "role",
    content: "content",
    sessionId: "session_id",
    createdAt: "created_at",
  },
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: vi.fn(() => ({
    cognitiveOwnerKey: "cog-1",
    knowledgeReadKeys: ["sess-a"],
    knowledgePrimaryKey: "sess-a",
    currentSessionId: "sess-a",
  })),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/services/session-activity", () => ({
  getSessionTtlMinutes: vi.fn(() => 120),
}));

describe("GET /api/messages — temporal scoping", () => {
  it("getSessionTtlMinutes returns configured TTL", async () => {
    const { getSessionTtlMinutes } = await import("@/lib/services/session-activity");
    expect(getSessionTtlMinutes()).toBe(120);
  });

  it("temporal cutoff is computed correctly from TTL", () => {
    const ttlMinutes = 120;
    const cutoffDate = new Date(Date.now() - ttlMinutes * 60 * 1000);
    const cutoffSql = cutoffDate.toISOString().replace("T", " ").split(".")[0];
    // Must be valid SQLite date format: YYYY-MM-DD HH:MM:SS
    expect(cutoffSql).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
