import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getSessionMeta, setSessionMeta, mergeSessionMeta } from "@/lib/services/session-metadata";

describe("session-metadata helper", () => {
  const sessionId = "test-meta-" + randomUUID().slice(0, 8);

  beforeEach(() => {
    // Ensure test session exists with default metadata
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    db.insert(sessions).values({
      id: sessionId,
      inviteCode: "test",
    }).run();
  });

  it("getSessionMeta returns parsed JSON from sessions.metadata", () => {
    db.update(sessions)
      .set({ metadata: JSON.stringify({ archetype: "developer" }) })
      .where(eq(sessions.id, sessionId))
      .run();

    const meta = getSessionMeta(sessionId);
    expect(meta).toEqual({ archetype: "developer" });
  });

  it("getSessionMeta returns {} for default metadata", () => {
    const meta = getSessionMeta(sessionId);
    expect(meta).toEqual({});
  });

  it("getSessionMeta returns {} for non-existent session", () => {
    const meta = getSessionMeta("nonexistent-session-id");
    expect(meta).toEqual({});
  });

  it("setSessionMeta writes entire metadata object", () => {
    setSessionMeta(sessionId, { archetype: "developer", score: 42 });
    const meta = getSessionMeta(sessionId);
    expect(meta).toEqual({ archetype: "developer", score: 42 });
  });

  it("setSessionMeta overwrites previous metadata", () => {
    setSessionMeta(sessionId, { archetype: "developer" });
    setSessionMeta(sessionId, { onlyThis: true });
    const meta = getSessionMeta(sessionId);
    expect(meta).toEqual({ onlyThis: true });
    expect(meta.archetype).toBeUndefined();
  });

  it("mergeSessionMeta merges without overwriting existing keys", () => {
    setSessionMeta(sessionId, { archetype: "developer" });
    const result = mergeSessionMeta(sessionId, { coherenceWarnings: ["warning1"] });
    expect(result).toEqual({ archetype: "developer", coherenceWarnings: ["warning1"] });

    // Verify persisted
    const meta = getSessionMeta(sessionId);
    expect(meta).toEqual({ archetype: "developer", coherenceWarnings: ["warning1"] });
  });

  it("mergeSessionMeta can delete a key by setting to undefined", () => {
    setSessionMeta(sessionId, { archetype: "developer", stale: true });
    const result = mergeSessionMeta(sessionId, { stale: undefined });
    expect(result).toEqual({ archetype: "developer" });
    expect(result.stale).toBeUndefined();
  });

  it("mergeSessionMeta can overwrite an existing key", () => {
    setSessionMeta(sessionId, { archetype: "developer" });
    const result = mergeSessionMeta(sessionId, { archetype: "designer" });
    expect(result).toEqual({ archetype: "designer" });
  });

  it("mergeSessionMeta on empty metadata works like set", () => {
    const result = mergeSessionMeta(sessionId, { archetype: "developer" });
    expect(result).toEqual({ archetype: "developer" });
  });

  it("mergeSessionMeta can set key to null (not undefined)", () => {
    setSessionMeta(sessionId, { archetype: "developer", warnings: ["w1"] });
    const result = mergeSessionMeta(sessionId, { warnings: null });
    expect(result).toEqual({ archetype: "developer", warnings: null });
    // null is preserved (not deleted), unlike undefined
    expect("warnings" in result).toBe(true);
  });
});
