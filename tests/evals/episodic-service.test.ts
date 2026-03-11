// tests/evals/episodic-service.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { sqlite } from "@/lib/db";

beforeEach(() => {
  sqlite.exec("DELETE FROM episodic_events");
  sqlite.exec("DELETE FROM episodic_pattern_proposals");
  sqlite.exec("DELETE FROM jobs WHERE job_type = 'consolidate_episodes'");
  // R4-1: clear FTS after hard DELETE to prevent rowid-reuse false matches
  sqlite.exec("INSERT INTO episodic_events_fts(episodic_events_fts) VALUES('delete-all')");
});

describe("insertEvent", () => {
  it("inserts an active event", async () => {
    const { insertEvent } = await import("@/lib/services/episodic-service");
    const id = insertEvent({
      ownerKey: "owner1", sessionId: "sess1",
      eventAtUnix: 1000000, eventAtHuman: "2026-01-01T10:00:00Z",
      actionType: "workout", narrativeSummary: "User ran 5km", rawInput: "I ran 5km",
    });
    const row = sqlite.prepare("SELECT * FROM episodic_events WHERE id = ?").get(id) as any;
    expect(row).toBeTruthy();
    expect(row.action_type).toBe("workout");
    expect(row.archived).toBe(0);
    expect(row.superseded_by).toBeNull();
  });

  it("inserts event with source field", async () => {
    const { insertEvent } = await import("@/lib/services/episodic-service");
    const id = insertEvent({
      ownerKey: "test-owner",
      sessionId: "test-session",
      eventAtUnix: 1710000000,
      eventAtHuman: "2026-03-10T00:00:00Z",
      actionType: "work",
      narrativeSummary: "Created repo",
      source: "github",
    });

    const row = sqlite.prepare("SELECT source FROM episodic_events WHERE id = ?").get(id) as any;
    expect(row.source).toBe("github");
  });

  it("defaults source to chat when not provided", async () => {
    const { insertEvent } = await import("@/lib/services/episodic-service");
    const id = insertEvent({
      ownerKey: "test-owner",
      sessionId: "test-session",
      eventAtUnix: 1710000000,
      eventAtHuman: "2026-03-10T00:00:00Z",
      actionType: "workout",
      narrativeSummary: "Ran 5km",
    });

    const row = sqlite.prepare("SELECT source FROM episodic_events WHERE id = ?").get(id) as any;
    expect(row.source).toBe("chat");
  });
});

describe("queryEvents", () => {
  it("excludes superseded events", async () => {
    const { insertEvent, supersedeEvent, queryEvents } = await import("@/lib/services/episodic-service");
    insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: 1000, eventAtHuman: "t1", actionType: "workout", narrativeSummary: "ran", rawInput: "ran" });
    const oldId = insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: 2000, eventAtHuman: "t2", actionType: "workout", narrativeSummary: "swam", rawInput: "swam" });
    const newId = insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: 2001, eventAtHuman: "t2c", actionType: "workout", narrativeSummary: "swam corrected", rawInput: "sc" });
    supersedeEvent(oldId, newId);
    const results = queryEvents({ ownerKey: "o1", fromUnix: 0, toUnix: 9999 });
    expect(results.length).toBe(2);
    expect(results.find(r => r.id === oldId)).toBeUndefined();
  });

  it("handles FTS special characters without throwing", async () => {
    const { insertEvent, queryEvents } = await import("@/lib/services/episodic-service");
    insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: 1000, eventAtHuman: "t1", actionType: "learning", narrativeSummary: "studied C++", rawInput: "r" });
    expect(() => queryEvents({ ownerKey: "o1", fromUnix: 0, toUnix: 9999, keywords: "C++" })).not.toThrow();
    expect(() => queryEvents({ ownerKey: "o1", fromUnix: 0, toUnix: 9999, keywords: "(learning)" })).not.toThrow();
    expect(() => queryEvents({ ownerKey: "o1", fromUnix: 0, toUnix: 9999, keywords: "-ran" })).not.toThrow();
  });
});

describe("countEventsByType", () => {
  it("returns aggregate counts not capped by event limit", async () => {
    const { insertEvent, countEventsByType } = await import("@/lib/services/episodic-service");
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 15; i++) {
      insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: now - i * 3600, eventAtHuman: `t${i}`, actionType: "workout", narrativeSummary: `run ${i}`, rawInput: "r" });
    }
    insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: now - 1000, eventAtHuman: "tm", actionType: "meal", narrativeSummary: "pizza", rawInput: "p" });
    const counts = countEventsByType("o1", 0, now + 1);
    expect(counts["workout"]).toBe(15);
    expect(counts["meal"]).toBe(1);
  });
});

describe("countKeywordEvents", () => {
  it("returns accurate count of keyword-matching events (for truncation detection)", async () => {
    const { insertEvent, countKeywordEvents } = await import("@/lib/services/episodic-service");
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 15; i++) {
      insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: now - i * 3600,
        eventAtHuman: `t${i}`, actionType: "workout", narrativeSummary: `ran in the park ${i}`, rawInput: "r" });
    }
    insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: now - 1000, eventAtHuman: "tm", actionType: "meal", narrativeSummary: "pizza lunch", rawInput: "p" });
    const count = countKeywordEvents({ ownerKey: "o1", fromUnix: 0, toUnix: now + 1, keywords: "park" });
    expect(count).toBe(15); // all workouts mention "park"
  });
});

describe("resolveEpisodicProposal — expiry guard (R5-4)", () => {
  it("cannot accept an expired proposal", async () => {
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "o1", actionType: "workout", patternSummary: "runs", eventCount: 3, lastEventAtUnix: 1000 });
    const pastDate = new Date(Date.now() - 86400_000).toISOString();
    sqlite.prepare("UPDATE episodic_pattern_proposals SET expires_at = ? WHERE id = ?").run(pastDate, id);
    const ok = resolveEpisodicProposal(id, "o1", true);
    expect(ok).toBe(false); // expired → resolve returns false
    const row = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(row.status).toBe("pending"); // not changed
  });
});

describe("getPendingEpisodicProposals — julianday expiry", () => {
  it("expires proposals whose ISO expires_at is in the past", async () => {
    const { insertEpisodicProposal, getPendingEpisodicProposals } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "o1", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: 9000 });
    const pastDate = new Date(Date.now() - 86400_000).toISOString();
    sqlite.prepare("UPDATE episodic_pattern_proposals SET expires_at = ? WHERE id = ?").run(pastDate, id);
    const pending = getPendingEpisodicProposals("o1");
    expect(pending.find(p => p.id === id)).toBeUndefined();
    const row = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(row.status).toBe("expired");
  });
});

describe("resolveEpisodicProposal", () => {
  it("rejects cross-owner resolution", async () => {
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "owner-A", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: 9000 });
    expect(resolveEpisodicProposal(id, "owner-B", true)).toBe(false);
    const row = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(row.status).toBe("pending");
  });

  it("accepts pending unexpired proposal", async () => {
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "o1", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: 9000 });
    expect(resolveEpisodicProposal(id, "o1", true)).toBe(true);
    const row = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(row.status).toBe("accepted");
  });

  it("sets rejection cooldown", async () => {
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "o1", actionType: "workout", patternSummary: "runs", eventCount: 3, lastEventAtUnix: 1000 });
    resolveEpisodicProposal(id, "o1", false);
    const row = sqlite.prepare("SELECT rejection_cooldown_until FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(row.rejection_cooldown_until).toBeTruthy();
  });

  it("returns false when already resolved (idempotency)", async () => {
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "o1", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: 9000 });
    resolveEpisodicProposal(id, "o1", true);
    expect(resolveEpisodicProposal(id, "o1", false)).toBe(false);
  });
});
