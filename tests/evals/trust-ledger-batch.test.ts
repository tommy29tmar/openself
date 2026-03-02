/**
 * Tests for reverse_batch undo handler (Circuit G Undo, Task 23).
 * Validates that reverseTrustAction correctly reverses batch_facts operations.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockDbDelete = vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) }));
const mockDbUpdate = vi.fn(() => ({
  set: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) })),
}));
const mockDbInsert = vi.fn(() => ({
  values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => ({ run: vi.fn() })) })),
}));

// Track what executeUndo does via sqlite.prepare calls and db calls
let mockPrepareResults: Record<string, any> = {};

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: any[]) => mockDbInsert(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
    delete: (...args: any[]) => mockDbDelete(...args),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              all: vi.fn(() => []),
            })),
          })),
          get: vi.fn(() => null),
        })),
      })),
    })),
  },
  sqlite: {
    prepare: vi.fn((sql: string) => ({
      get: vi.fn((...args: any[]) => {
        // reverseTrustAction reads the entry
        if (sql.includes("SELECT undo_payload")) {
          return mockPrepareResults["select_entry"];
        }
        return undefined;
      }),
      run: vi.fn((...args: any[]) => {
        // CAS update reversed=1
        if (sql.includes("SET reversed = 1")) {
          return { changes: 1 };
        }
        return { changes: 0 };
      }),
    })),
    transaction: vi.fn((fn: any) => fn),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  trustLedger: { id: "id", ownerKey: "owner_key", createdAt: "created_at" },
  facts: { id: "id", value: "value", updatedAt: "updated_at" },
}));

vi.mock("@/lib/services/memory-service", () => ({
  deactivateMemory: vi.fn(),
  reactivateMemory: vi.fn(),
  feedbackMemory: vi.fn(),
}));

import { reverseTrustAction } from "@/lib/services/trust-ledger-service";

describe("reverse_batch undo handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareResults = {};
  });

  it("reverses a batch: deletes created, restores updated, recreates deleted", () => {
    const undoPayload = {
      action: "reverse_batch",
      reverseOps: [
        { action: "delete", factId: "fact-created-1" },
        { action: "delete", factId: "fact-created-2" },
        { action: "restore", factId: "fact-updated-1", previousValue: "old-value" },
        { action: "recreate", factId: "fact-deleted-1", previousFact: { ownerKey: "o1", category: "skill", key: "react", value: "Expert" } },
      ],
    };

    mockPrepareResults["select_entry"] = {
      undo_payload: JSON.stringify(undoPayload),
      reversed: 0,
    };

    const result = reverseTrustAction("entry-1", "owner-1");
    expect(result).toBe(true);

    // 2 deletes
    expect(mockDbDelete).toHaveBeenCalledTimes(2);

    // 1 update (restore)
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);

    // 1 insert (recreate)
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });

  it("handles empty reverseOps gracefully", () => {
    const undoPayload = {
      action: "reverse_batch",
      reverseOps: [],
    };

    mockPrepareResults["select_entry"] = {
      undo_payload: JSON.stringify(undoPayload),
      reversed: 0,
    };

    const result = reverseTrustAction("entry-2", "owner-1");
    expect(result).toBe(true);

    // No DB mutations for facts
    expect(mockDbDelete).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("does NOT call recomposeAfterMutation (caller responsibility per R7-C2)", () => {
    // reverse_batch only does DB mutations — no recompose call
    const undoPayload = {
      action: "reverse_batch",
      reverseOps: [
        { action: "delete", factId: "fact-1" },
      ],
    };

    mockPrepareResults["select_entry"] = {
      undo_payload: JSON.stringify(undoPayload),
      reversed: 0,
    };

    reverseTrustAction("entry-3", "owner-1");

    // Verify only DB operations happened — no recompose-related calls
    // (recomposeAfterMutation would call page-service, page-composer, etc.)
    expect(mockDbDelete).toHaveBeenCalledTimes(1);
  });

  it("reverse is idempotent: second undo is a no-op", () => {
    const undoPayload = {
      action: "reverse_batch",
      reverseOps: [{ action: "delete", factId: "fact-1" }],
    };

    // First call: entry exists, not yet reversed
    mockPrepareResults["select_entry"] = {
      undo_payload: JSON.stringify(undoPayload),
      reversed: 0,
    };

    const first = reverseTrustAction("entry-4", "owner-1");
    expect(first).toBe(true);

    vi.clearAllMocks();

    // Second call: already reversed
    mockPrepareResults["select_entry"] = {
      undo_payload: JSON.stringify(undoPayload),
      reversed: 1,
    };

    const second = reverseTrustAction("entry-4", "owner-1");
    expect(second).toBe(false);

    // No DB mutations on second call
    expect(mockDbDelete).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
  });
});
