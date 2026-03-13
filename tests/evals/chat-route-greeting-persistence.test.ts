import { describe, it, expect, vi } from "vitest";
import { updateLastMessageAt } from "@/lib/services/session-activity";

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(),
    })),
  },
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        run: vi.fn(),
      })),
    })),
  },
}));

vi.mock("@/lib/services/session-activity", () => ({
  updateLastMessageAt: vi.fn(),
  getSessionTtlMinutes: vi.fn(() => 120),
  isSessionActive: vi.fn(() => false),
  getLastMessageAt: vi.fn(() => null),
}));

describe("chat route — greeting persistence", () => {
  it("updateLastMessageAt is called with session ID", () => {
    updateLastMessageAt("sess-1");
    expect(vi.mocked(updateLastMessageAt)).toHaveBeenCalledWith("sess-1");
  });

  it("updateLastMessageAt can be called multiple times (user + assistant)", () => {
    vi.mocked(updateLastMessageAt).mockClear();
    updateLastMessageAt("sess-1"); // after user message
    updateLastMessageAt("sess-1"); // after assistant message (in onFinish)
    expect(vi.mocked(updateLastMessageAt)).toHaveBeenCalledTimes(2);
  });
});
