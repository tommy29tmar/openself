import { describe, it, expect, vi, beforeEach } from "vitest";
import { VisibilityTransitionError } from "@/lib/services/kb-service";

// We test the transition matrix logic directly without the DB layer.
// Import the function and mock only the DB + event-service.

const mockGet = vi.fn();
const mockRun = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: (...args: any[]) => mockGet(...args),
          all: () => [],
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          run: (...args: any[]) => mockRun(...args),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({ run: vi.fn() }),
        onConflictDoNothing: () => ({ run: vi.fn() }),
        run: vi.fn(),
      }),
    }),
    delete: () => ({
      where: () => ({ run: vi.fn() }),
    }),
  },
  sqlite: {},
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

vi.mock("@/lib/flags", () => ({
  PROFILE_ID_CANONICAL: false,
}));

vi.mock("@/lib/taxonomy/normalizeCategory", () => ({
  normalizeCategory: vi.fn(async (category: string) => ({
    canonical: category,
    action: "exact_match",
  })),
}));

// Must import AFTER mocks
import { setFactVisibility } from "@/lib/services/kb-service";
import { logEvent } from "@/lib/services/event-service";

function makeMockFact(overrides: {
  id?: string;
  category: string;
  visibility: string;
  sessionId?: string;
}) {
  return {
    id: overrides.id ?? "f1",
    sessionId: overrides.sessionId ?? "sess1",
    profileId: overrides.sessionId ?? "sess1",
    category: overrides.category,
    key: "test-key",
    value: { name: "test" },
    visibility: overrides.visibility,
    confidence: 1.0,
    source: "chat",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("setFactVisibility — transition matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRun.mockReturnValue(undefined);
  });

  describe("assistant actor", () => {
    it("can set non-sensitive fact to proposed", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "skill", visibility: "private" }));
      const result = setFactVisibility("f1", "proposed", "assistant", "sess1");
      expect(result.visibility).toBe("proposed");
    });

    it("can set non-sensitive fact to private", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "skill", visibility: "proposed" }));
      const result = setFactVisibility("f1", "private", "assistant", "sess1");
      expect(result.visibility).toBe("private");
    });

    it("CANNOT set fact to public", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "skill", visibility: "proposed" }));
      expect(() =>
        setFactVisibility("f1", "public", "assistant", "sess1"),
      ).toThrow(VisibilityTransitionError);
    });

    it("CANNOT set sensitive fact to proposed", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "compensation", visibility: "private" }));
      expect(() =>
        setFactVisibility("f1", "proposed", "assistant", "sess1"),
      ).toThrow(VisibilityTransitionError);
    });

    it("CAN set contact fact to proposed (contact is user-controlled)", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "contact", visibility: "private" }));
      const result = setFactVisibility("f1", "proposed", "assistant", "sess1");
      expect(result.visibility).toBe("proposed");
    });
  });

  describe("user actor", () => {
    it("can set non-sensitive fact to public", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "skill", visibility: "proposed" }));
      const result = setFactVisibility("f1", "public", "user", "sess1");
      expect(result.visibility).toBe("public");
    });

    it("can set non-sensitive fact to proposed", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "skill", visibility: "private" }));
      const result = setFactVisibility("f1", "proposed", "user", "sess1");
      expect(result.visibility).toBe("proposed");
    });

    it("can set non-sensitive fact to private", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "skill", visibility: "public" }));
      const result = setFactVisibility("f1", "private", "user", "sess1");
      expect(result.visibility).toBe("private");
    });

    it("can set sensitive fact to private (retract for cleanup)", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "compensation", visibility: "private" }));
      const result = setFactVisibility("f1", "private", "user", "sess1");
      expect(result.visibility).toBe("private");
    });

    it("CANNOT set sensitive fact to public", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "compensation", visibility: "private" }));
      expect(() =>
        setFactVisibility("f1", "public", "user", "sess1"),
      ).toThrow(VisibilityTransitionError);
    });

    it("CAN set contact fact to public (contact is user-controlled)", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "contact", visibility: "proposed" }));
      const result = setFactVisibility("f1", "public", "user", "sess1");
      expect(result.visibility).toBe("public");
    });

    it("CANNOT set sensitive fact to proposed", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "health", visibility: "private" }));
      expect(() =>
        setFactVisibility("f1", "proposed", "user", "sess1"),
      ).toThrow(VisibilityTransitionError);
    });
  });

  describe("round-trip transitions (user)", () => {
    it("private → proposed → public → proposed → private", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "skill", visibility: "private" }));
      expect(setFactVisibility("f1", "proposed", "user", "sess1").visibility).toBe("proposed");

      mockGet.mockReturnValue(makeMockFact({ category: "skill", visibility: "proposed" }));
      expect(setFactVisibility("f1", "public", "user", "sess1").visibility).toBe("public");

      mockGet.mockReturnValue(makeMockFact({ category: "skill", visibility: "public" }));
      expect(setFactVisibility("f1", "proposed", "user", "sess1").visibility).toBe("proposed");

      mockGet.mockReturnValue(makeMockFact({ category: "skill", visibility: "proposed" }));
      expect(setFactVisibility("f1", "private", "user", "sess1").visibility).toBe("private");
    });
  });

  describe("fact not found", () => {
    it("throws when fact does not exist", () => {
      mockGet.mockReturnValue(undefined);
      expect(() =>
        setFactVisibility("nonexistent", "proposed", "user", "sess1"),
      ).toThrow("not found");
    });
  });

  describe("audit logging", () => {
    it("logs visibility change event", () => {
      mockGet.mockReturnValue(makeMockFact({ category: "skill", visibility: "private" }));
      setFactVisibility("f1", "proposed", "user", "sess1");

      expect(logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "fact_visibility_changed",
          actor: "user",
          payload: expect.objectContaining({
            factId: "f1",
            from: "private",
            to: "proposed",
          }),
        }),
      );
    });
  });

  describe("sensitive categories — comprehensive", () => {
    const sensitiveCats = [
      "compensation",
      "salary",
      "health",
      "mental-health",
      "private-contact",
      "personal-struggle",
      // "contact" removed — now user-controlled (not sensitive)
    ];

    for (const cat of sensitiveCats) {
      it(`blocks ${cat} → public`, () => {
        mockGet.mockReturnValue(makeMockFact({ category: cat, visibility: "private" }));
        expect(() =>
          setFactVisibility("f1", "public", "user", "sess1"),
        ).toThrow(VisibilityTransitionError);
      });

      it(`blocks ${cat} → proposed`, () => {
        mockGet.mockReturnValue(makeMockFact({ category: cat, visibility: "private" }));
        expect(() =>
          setFactVisibility("f1", "proposed", "user", "sess1"),
        ).toThrow(VisibilityTransitionError);
      });

      it(`allows ${cat} → private`, () => {
        mockGet.mockReturnValue(makeMockFact({ category: cat, visibility: "private" }));
        const result = setFactVisibility("f1", "private", "user", "sess1");
        expect(result.visibility).toBe("private");
      });
    }
  });
});
