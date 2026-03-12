// tests/evals/session-compaction-real-db.test.ts
import { describe, it, expect, vi, afterAll } from "vitest";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: JSON.stringify({
      topics: ["career"],
      factsChanged: [],
      patternsObserved: ["User prefers concise responses"],
      sessionMood: "productive",
      keyTakeaways: ["Career transition discussion"],
    }),
    usage: { promptTokens: 100, completionTokens: 50 },
  }),
}));

vi.mock("@/lib/ai/provider", () => ({
  getModelForTier: vi.fn().mockReturnValue("mock-model"),
  getModelIdForTier: vi.fn().mockReturnValue("mock-model-id"),
  getProviderForTier: vi.fn().mockReturnValue("mock-provider"),
  getThinkingProviderOptions: vi.fn(() => ({})),
}));

vi.mock("@/lib/services/usage-service", () => ({
  checkBudget: vi.fn().mockReturnValue({ allowed: true }),
  recordUsage: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/services/summary-service", () => ({
  getSummary: vi.fn().mockReturnValue(null),
}));

describe("session compaction real DB", () => {
  const ownerKey = `test-compact-real-${randomUUID()}`;
  const sessionKey = `sess-${randomUUID()}`;

  afterAll(() => {
    sqlite.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionKey);
    sqlite
      .prepare("DELETE FROM session_compaction_log WHERE owner_key = ?")
      .run(ownerKey);
  });

  it("should compact messages and return structured summary", async () => {
    // Seed 10 messages alternating user/assistant
    for (let i = 0; i < 10; i++) {
      sqlite
        .prepare(
          `INSERT INTO messages (id, session_id, role, content, created_at)
           VALUES (?, ?, ?, ?, datetime('now', '-${10 - i} minutes'))`,
        )
        .run(
          randomUUID(),
          sessionKey,
          i % 2 === 0 ? "user" : "assistant",
          `Message ${i}`,
        );
    }

    const { runSessionCompaction } = await import(
      "@/lib/services/session-compaction-service"
    );

    // Read messages with rowid — the compaction service expects rowid on each
    const messages = sqlite
      .prepare(
        "SELECT *, rowid FROM messages WHERE session_id = ? ORDER BY rowid LIMIT 40",
      )
      .all(sessionKey) as Array<{
      rowid: number;
      role: string;
      content: string;
    }>;

    const result = await runSessionCompaction({
      ownerKey,
      sessionKey,
      messages,
      knowledgeReadKeys: [ownerKey],
    });

    expect(result.success).toBe(true);
    expect(result.structuredSummary).not.toBeNull();
    expect(result.structuredSummary?.patternsObserved).toContain(
      "User prefers concise responses",
    );
    expect(result.structuredSummary?.sessionMood).toBe("productive");
    expect(result.structuredSummary?.topics).toEqual(["career"]);
    expect(result.structuredSummary?.keyTakeaways).toEqual([
      "Career transition discussion",
    ]);
  });

  it("should return insufficient_messages for fewer than 4 messages", async () => {
    const shortSessionKey = `sess-short-${randomUUID()}`;
    for (let i = 0; i < 3; i++) {
      sqlite
        .prepare(
          "INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)",
        )
        .run(randomUUID(), shortSessionKey, "user", `Msg ${i}`);
    }

    const { runSessionCompaction } = await import(
      "@/lib/services/session-compaction-service"
    );

    const messages = sqlite
      .prepare(
        "SELECT *, rowid FROM messages WHERE session_id = ? ORDER BY rowid",
      )
      .all(shortSessionKey) as Array<{
      rowid: number;
      role: string;
      content: string;
    }>;

    const result = await runSessionCompaction({
      ownerKey,
      sessionKey: shortSessionKey,
      messages,
      knowledgeReadKeys: [ownerKey],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("insufficient_messages");

    // Cleanup
    sqlite
      .prepare("DELETE FROM messages WHERE session_id = ?")
      .run(shortSessionKey);
  });
});
