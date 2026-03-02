import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logEvent to capture actor parameter
const mockLogEvent = vi.fn();
vi.mock("@/lib/services/event-service", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));

// Mock DB layer
const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockReturnValue({
    onConflictDoUpdate: vi.fn().mockReturnValue({ run: vi.fn() }),
  }),
});
const mockSelect = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue({
        id: "fact-1",
        sessionId: "s1",
        category: "skill",
        key: "ts",
        value: { name: "TypeScript" },
        source: "chat",
        visibility: "proposed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      all: vi.fn().mockReturnValue([]),
    }),
  }),
});
vi.mock("@/lib/db", () => ({
  db: { insert: (...a: unknown[]) => mockInsert(...a), select: (...a: unknown[]) => mockSelect(...a) },
  sqlite: {},
}));
vi.mock("@/lib/db/schema", () => ({
  facts: { sessionId: "session_id", category: "category", key: "key", visibility: "visibility", archivedAt: "archived_at" },
  categoryRegistry: { category: "category" },
  categoryAliases: { alias: "alias", category: "category" },
}));
vi.mock("@/lib/taxonomy/normalizeCategory", () => ({
  normalizeCategory: vi.fn().mockResolvedValue({ canonical: "skill", action: "exact" }),
}));
vi.mock("@/lib/visibility/policy", () => ({
  initialVisibility: vi.fn().mockReturnValue("proposed"),
  isSensitiveCategory: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/flags", () => ({
  PROFILE_ID_CANONICAL: false,
}));
vi.mock("@/lib/services/fact-validation", () => ({
  validateFactValue: vi.fn(),
}));
vi.mock("@/lib/services/fact-constraints", () => ({
  FactConstraintError: class extends Error {},
  CURRENT_UNIQUE_CATEGORIES: new Set(),
}));

const { createFact } = await import("@/lib/services/kb-service");

describe("createFact actor parameter", () => {
  beforeEach(() => {
    mockLogEvent.mockClear();
  });

  it("defaults actor to 'assistant' when not specified", async () => {
    await createFact(
      { category: "skill", key: "ts", value: { name: "TypeScript" } },
      "s1",
      "p1",
    );
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent.mock.calls[0][0].actor).toBe("assistant");
  });

  it("uses provided actor when specified via options", async () => {
    await createFact(
      { category: "skill", key: "ts2", value: { name: "TypeScript" } },
      "s1",
      "p1",
      { actor: "connector" },
    );
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent.mock.calls[0][0].actor).toBe("connector");
  });
});
