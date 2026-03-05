import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/services/usage-service", () => ({ checkBudget: vi.fn(() => ({ allowed: true })), recordUsage: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ getModelForTier: vi.fn(() => "mock"), getModelIdForTier: vi.fn(() => "gemini-2.5-flash"), getProviderForTier: vi.fn(() => "google") }));
vi.mock("@/lib/services/kb-service", () => ({ getActiveFacts: vi.fn(() => []) }));
vi.mock("@/lib/services/summary-service", () => ({ getSummary: vi.fn(() => null) }));
vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(() => null), run: vi.fn(), all: vi.fn(() => []) })) },
}));

import { runSessionCompaction } from "@/lib/services/session-compaction-service";
import { generateText } from "ai";

const MSGS = [
  { rowid: 1, role: "user", content: "Hi, I'm Alice, PM at Stripe" },
  { rowid: 2, role: "assistant", content: "Saved that." },
  { rowid: 3, role: "user", content: "8 years exp, love hiking" },
  { rowid: 4, role: "assistant", content: "Added." },
  { rowid: 5, role: "user", content: "Make layout vertical" },
  { rowid: 6, role: "assistant", content: "Done." },
];

const VALID_JSON = JSON.stringify({
  topics: ["professional background", "layout"],
  factsChanged: ["Added job at Stripe as PM", "Added hiking as activity"],
  patternsObserved: ["User prefers concise responses"],
  sessionMood: "productive",
  keyTakeaways: ["Alice is PM at Stripe", "Prefers vertical layout"],
});

describe("runSessionCompaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns failure for < 4 messages", async () => {
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MSGS.slice(0, 2) });
    expect(r.success).toBe(false);
    expect(r.error).toBe("insufficient_messages");
  });

  it("returns failure when budget exceeded", async () => {
    const { checkBudget } = await import("@/lib/services/usage-service");
    vi.mocked(checkBudget).mockReturnValueOnce({ allowed: false, warningMessage: "over" });
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MSGS });
    expect(r.success).toBe(false);
    expect(r.error).toBe("budget_exceeded");
  });

  it("returns structured summary on valid JSON", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: VALID_JSON, usage: { promptTokens: 100, completionTokens: 50 } } as never);
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MSGS });
    expect(r.success).toBe(true);
    expect(r.structuredSummary?.sessionMood).toBe("productive");
    expect(r.patternsDetected).toBe(1);
    expect(r.factsExtracted).toBe(2);
  });

  it("returns failure for non-JSON response with errorCode=json_parse_failure", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: "Here is a summary...", usage: {} } as never);
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MSGS });
    expect(r.success).toBe(false);
    expect(r.error).toBe("json_parse_failure");
    expect(r.errorCode).toBe("json_parse_failure");
    expect(r.skipped).toBe(false);
  });

  it("returns skipped=true on 3rd deterministic failure (within MAX_ATTEMPTS=3)", async () => {
    // countDeterministicFailures returns 2 (this run is the 3rd → 2+1 >= 3 → skip immediately)
    vi.mocked(generateText).mockResolvedValueOnce({ text: "not json", usage: {} } as never);
    const { sqlite } = await import("@/lib/db");
    // First prepare: countDeterministicFailures → 2
    vi.mocked(sqlite.prepare).mockReturnValueOnce({ get: vi.fn(() => ({ cnt: 2 })) } as never);
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MSGS });
    expect(r.success).toBe(false);
    expect(r.skipped).toBe(true);
    expect(r.errorCode).toBe("json_parse_failure");
  });

  it("returns schema_validation_failure for valid JSON with wrong shape", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: '{"topics": "not-an-array"}', usage: {} } as never);
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MSGS });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe("schema_validation_failure");
    expect(r.skipped).toBe(false); // countDeterministicFailures = 0 → 0+1 < 3 → not skip yet
  });

  it("truncates oversized messages and succeeds", async () => {
    const hugeMsgs = Array.from({ length: 6 }, (_, i) => ({ rowid: i + 1, role: i % 2 === 0 ? "user" : "assistant", content: "x".repeat(15_000) }));
    vi.mocked(generateText).mockResolvedValueOnce({ text: VALID_JSON, usage: {} } as never);
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: hugeMsgs });
    expect(r.success).toBe(true);
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect((call.prompt as string).includes("[truncated]")).toBe(true);
  });
});
