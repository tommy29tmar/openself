import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

/**
 * Tests the dedup logic directly against an in-memory SQLite DB.
 * We replicate the dedup query (not the full chat route) to verify correctness.
 */
describe("chat message dedup", () => {
  let raw: InstanceType<typeof Database>;

  beforeEach(() => {
    raw = new Database(":memory:");
    raw.exec(`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  });

  afterEach(() => {
    raw.close();
  });

  /** SQLite CURRENT_TIMESTAMP format: "YYYY-MM-DD HH:MM:SS" */
  function sqliteNow(): string {
    return new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  }
  function sqliteThirtySecondsAgo(): string {
    return new Date(Date.now() - 30_000).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  }

  it("should not insert duplicate user message within 30s window", () => {
    const now = sqliteNow();
    raw.prepare(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run("msg-1", "session-a", "user", "ciao sono Marco", now);

    const recent = raw.prepare(`
      SELECT id, created_at FROM messages
      WHERE session_id = ? AND role = 'user' AND content = ?
      ORDER BY created_at DESC LIMIT 1
    `).get("session-a", "ciao sono Marco") as { id: string; created_at: string } | undefined;

    expect(recent).toBeDefined();
    expect(recent!.id).toBe("msg-1");

    const cutoff = sqliteThirtySecondsAgo();
    expect(recent!.created_at > cutoff).toBe(true);

    const count = raw.prepare("SELECT count(*) as c FROM messages").get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("should allow same content after 30s window", () => {
    raw.prepare(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run("msg-1", "session-a", "user", "ciao sono Marco", "2020-01-01 00:00:00");

    const recent = raw.prepare(`
      SELECT id, created_at FROM messages
      WHERE session_id = ? AND role = 'user' AND content = ?
      ORDER BY created_at DESC LIMIT 1
    `).get("session-a", "ciao sono Marco") as { id: string; created_at: string } | undefined;

    expect(recent).toBeDefined();

    const cutoff = sqliteThirtySecondsAgo();
    expect(recent!.created_at > cutoff).toBe(false);
  });

  it("should allow same content from different sessions", () => {
    raw.prepare(
      "INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)",
    ).run("msg-1", "session-a", "user", "ciao sono Marco");

    const recent = raw.prepare(`
      SELECT id, created_at FROM messages
      WHERE session_id = ? AND role = 'user' AND content = ?
      ORDER BY created_at DESC LIMIT 1
    `).get("session-b", "ciao sono Marco") as { id: string; created_at: string } | undefined;

    expect(recent).toBeUndefined();
  });

  it("should skip dedup and JSON.stringify non-string content (UserContent array)", () => {
    // Simulate array-type UserContent (e.g. [{type: "text", text: "hello"}])
    const arrayContent = [{ type: "text", text: "hello" }];

    // The route's guard: typeof content === "string" ? content : null
    const contentStr =
      typeof arrayContent === "string" ? arrayContent : null;
    expect(contentStr).toBeNull();

    // When contentStr is null, dedup is skipped (recent = undefined)
    // and content is persisted via JSON.stringify
    const serialized = JSON.stringify(arrayContent);
    expect(serialized).toBe('[{"type":"text","text":"hello"}]');

    // Insert serialized content — always creates new row, no dedup
    raw.prepare(
      "INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)",
    ).run("msg-arr-1", "session-a", "user", serialized);

    // Insert same array content again — no dedup, both rows exist
    raw.prepare(
      "INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)",
    ).run("msg-arr-2", "session-a", "user", serialized);

    const count = raw.prepare("SELECT count(*) as c FROM messages").get() as { c: number };
    expect(count.c).toBe(2);
  });
});
