import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) },
  db: {},
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { sortFactsForContext } from "@/lib/agent/context";
import type { FactRow } from "@/lib/services/kb-service";

function makeF(id: string, updatedAt: string, confidence = 1.0): FactRow {
  return {
    id, category: "skill", key: id, value: {}, confidence,
    updatedAt, createdAt: updatedAt, archivedAt: null,
    source: "user", parentFactId: null, sortOrder: 0,
    sessionId: "s1", visibility: "proposed",
  } as FactRow;
}

describe("sortFactsForContext", () => {
  it("always includes the 5 most recently updated facts regardless of score", () => {
    const old = Array.from({ length: 47 }, (_, i) =>
      makeF(`old-${i}`, "2020-01-01T00:00:00.000Z", 1.0)
    );
    const recent = Array.from({ length: 5 }, (_, i) =>
      makeF(`recent-${i}`, "2026-03-04T00:00:00.000Z", 0.1)
    );
    const all = [...old, ...recent];

    const result = sortFactsForContext(all, new Map(), 50);
    const ids = result.map(f => f.id);

    for (let i = 0; i < 5; i++) {
      expect(ids).toContain(`recent-${i}`);
    }
    expect(result).toHaveLength(50);
  });

  it("returns all facts when total <= cap", () => {
    const facts = [makeF("a", "2026-01-01"), makeF("b", "2025-06-01")];
    const result = sortFactsForContext(facts, new Map(), 50);
    expect(result).toHaveLength(2);
  });

  it("tie-breaks on updatedAt desc when scores are equal", () => {
    const f1 = makeF("older", "2025-01-01", 1.0);
    const f2 = makeF("newer", "2026-01-01", 1.0);
    const result = sortFactsForContext([f1, f2], new Map(), 50);
    expect(result[0].id).toBe("newer");
  });
});
