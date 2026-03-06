// tests/evals/episodic-tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sqlite } from "@/lib/db";

beforeEach(() => {
  sqlite.exec("DELETE FROM episodic_events");
  sqlite.exec("DELETE FROM episodic_pattern_proposals");
  sqlite.exec("DELETE FROM jobs WHERE job_type = 'consolidate_episodes'");
  sqlite.exec("DELETE FROM facts WHERE key LIKE 'habit_%'");
  sqlite.exec("DELETE FROM trust_ledger");
  sqlite.exec("INSERT INTO episodic_events_fts(episodic_events_fts) VALUES('delete-all')");
  // Ensure session exists for createFact FK constraint (facts.session_id → sessions.id)
  sqlite.exec("INSERT OR IGNORE INTO sessions(id, invite_code) VALUES ('sess1', 'test')");
  vi.resetModules();
});

async function makeTools(ownerKey = "owner1", sessionId = "sess1") {
  const { createAgentTools } = await import("@/lib/agent/tools");
  const { tools } = createAgentTools("en", sessionId, ownerKey);
  return tools;
}

describe("record_event tool", () => {
  it("inserts event and returns success", async () => {
    const tools = await makeTools();
    const result = await (tools.record_event as any).execute({
      actionType: "workout", eventAtHuman: "2026-03-05T10:00:00Z", summary: "User ran 5km",
    }, { messages: [] });
    expect(result.success).toBe(true);
    expect(result.eventId).toBeTruthy();
    const row = sqlite.prepare("SELECT * FROM episodic_events WHERE id = ?").get(result.eventId) as any;
    expect(row.action_type).toBe("workout");
    const trustRow = sqlite
      .prepare("SELECT entity_id FROM trust_ledger WHERE action_type = 'record_event' ORDER BY created_at DESC LIMIT 1")
      .get() as any;
    expect(trustRow.entity_id).toBe(result.eventId);
  });

  it("enqueues consolidate_episodes job", async () => {
    const tools = await makeTools();
    await (tools.record_event as any).execute({
      actionType: "workout", eventAtHuman: "2026-03-05T10:00:00Z", summary: "ran",
    }, { messages: [] });
    const job = sqlite.prepare(
      "SELECT * FROM jobs WHERE job_type = 'consolidate_episodes' AND status = 'queued'"
    ).get() as any;
    expect(job).toBeTruthy();
    expect(JSON.parse(job.payload).ownerKey).toBe("owner1");
  });

  it("returns success even if consolidation job already queued (enqueueJob onConflictDoNothing is silent)", async () => {
    sqlite.exec(`INSERT INTO jobs (job_type, payload, status, run_after)
      VALUES ('consolidate_episodes', '{"ownerKey":"owner1"}', 'queued', datetime('now'))`);
    const tools = await makeTools();
    const result = await (tools.record_event as any).execute({
      actionType: "workout", eventAtHuman: "2026-03-05T10:00:00Z", summary: "ran again",
    }, { messages: [] });
    expect(result.success).toBe(true);
    expect(result.eventId).toBeTruthy();
  });

  it("returns failure for invalid ISO date", async () => {
    const tools = await makeTools();
    const result = await (tools.record_event as any).execute({
      actionType: "workout", eventAtHuman: "not-a-date", summary: "Something",
    }, { messages: [] });
    expect(result.success).toBe(false);
  });
});

describe("recall_episodes tool", () => {
  it("returns events and aggregate countsByType", async () => {
    const { insertEvent } = await import("@/lib/services/episodic-service");
    const now = Math.floor(Date.now() / 1000);
    insertEvent({ ownerKey: "owner1", sessionId: "s1", eventAtUnix: now - 3600, eventAtHuman: "h", actionType: "workout", narrativeSummary: "ran 5km", rawInput: "ran" });
    insertEvent({ ownerKey: "owner1", sessionId: "s1", eventAtUnix: now - 8 * 86400, eventAtHuman: "h2", actionType: "workout", narrativeSummary: "old run", rawInput: "old" });
    const tools = await makeTools();
    const result = await (tools.recall_episodes as any).execute({ timeframe: "last_7_days" }, { messages: [] });
    expect(result.success).toBe(true);
    expect(result.events.length).toBe(1);
  });

  it("countsByType from aggregate (accurate beyond 10-item cap)", async () => {
    const { insertEvent } = await import("@/lib/services/episodic-service");
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 15; i++) {
      insertEvent({ ownerKey: "owner1", sessionId: "s1", eventAtUnix: now - i * 3600,
        eventAtHuman: `h${i}`, actionType: "workout", narrativeSummary: `run ${i}`, rawInput: "r" });
    }
    const tools = await makeTools();
    const result = await (tools.recall_episodes as any).execute({ timeframe: "last_7_days" }, { messages: [] });
    expect(result.events.length).toBe(10);
    expect(result.truncated).toBe(true);
    expect(result.countsByType["workout"]).toBe(15);
  });

  it("keyword-path: countsByType from keyword results, truncated via countKeywordEvents (R5-5)", async () => {
    const { insertEvent } = await import("@/lib/services/episodic-service");
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 15; i++) {
      insertEvent({ ownerKey: "owner1", sessionId: "s1", eventAtUnix: now - i * 3600,
        eventAtHuman: `h${i}`, actionType: "workout", narrativeSummary: `ran in the park ${i}`, rawInput: "r" });
    }
    insertEvent({ ownerKey: "owner1", sessionId: "s1", eventAtUnix: now - 1000, eventAtHuman: "tm", actionType: "meal", narrativeSummary: "pizza lunch", rawInput: "p" });
    const tools = await makeTools();
    const result = await (tools.recall_episodes as any).execute({ timeframe: "last_7_days", keywords: "park" }, { messages: [] });
    expect(result.success).toBe(true);
    expect(result.events.length).toBe(10);     // capped
    expect(result.truncated).toBe(true);         // R5-5: accurate (15 total, 10 shown)
    expect(result.countsByType["workout"]).toBe(10); // from returned events (keyword-filtered)
    expect(result.countsByType["meal"]).toBeUndefined();
  });
});

describe("confirm_episodic_pattern tool", () => {
  it("accepts proposal, marks accepted, creates activity fact, and recomposes draft", async () => {
    const { insertEpisodicProposal } = await import("@/lib/services/episodic-service");
    const { getDraft } = await import("@/lib/services/page-service");
    const prevExtended = process.env.EXTENDED_SECTIONS;
    process.env.EXTENDED_SECTIONS = "true";
    try {
      const id = insertEpisodicProposal({
        ownerKey: "owner1", actionType: "workout", patternSummary: "runs 3x/week", eventCount: 5, lastEventAtUnix: 9999,
      });
      const tools = await makeTools();
      const result = await (tools.confirm_episodic_pattern as any).execute({ proposalId: id, accept: true }, { messages: [] });
      expect(result.success).toBe(true);
      expect(result.recomposeOk).toBe(true);
      const propRow = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
      expect(propRow.status).toBe("accepted");
      const factRow = sqlite.prepare("SELECT category, value FROM facts WHERE key = 'habit_workout'").get() as any;
      expect(factRow).toBeTruthy();
      expect(factRow.category).toBe("activity");
      const v = JSON.parse(factRow.value);
      expect(v.name).toBe("Workout");
      expect(v.description).toContain("runs");
      expect(v.frequency).toBe("regularly");

      const draft = getDraft("sess1");
      const activities = draft?.config.sections.find((section) => section.type === "activities");
      expect(activities).toBeTruthy();
      const trustRow = sqlite
        .prepare("SELECT entity_id FROM trust_ledger WHERE action_type = 'confirm_episodic_pattern' ORDER BY created_at DESC LIMIT 1")
        .get() as any;
      expect(trustRow.entity_id).toBe(id);
    } finally {
      process.env.EXTENDED_SECTIONS = prevExtended;
    }
  });

  it("reject does not create a fact", async () => {
    const { insertEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "owner1", actionType: "workout", patternSummary: "runs", eventCount: 3, lastEventAtUnix: 1000 });
    const tools = await makeTools();
    await (tools.confirm_episodic_pattern as any).execute({ proposalId: id, accept: false }, { messages: [] });
    expect(sqlite.prepare("SELECT * FROM facts WHERE key = 'habit_workout'").get()).toBeUndefined();
  });

  it("returns failure for another owner's proposal", async () => {
    const { insertEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "other", actionType: "workout", patternSummary: "runs", eventCount: 3, lastEventAtUnix: 1000 });
    const tools = await makeTools("owner1");
    const result = await (tools.confirm_episodic_pattern as any).execute({ proposalId: id, accept: true }, { messages: [] });
    expect(result.success).toBe(false);
    const propRow = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(propRow.status).toBe("pending");
  });

  it("R8-1: expired proposal returns failure without creating a fact", async () => {
    const { insertEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "owner1", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: 9999 });
    sqlite.prepare("UPDATE episodic_pattern_proposals SET expires_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 86400_000).toISOString(), id);
    const tools = await makeTools();
    const result = await (tools.confirm_episodic_pattern as any).execute({ proposalId: id, accept: true }, { messages: [] });
    expect(result.success).toBe(false);
    expect(sqlite.prepare("SELECT * FROM facts WHERE key = 'habit_workout'").get()).toBeUndefined();
    const propRow = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(propRow.status).toBe("pending");
  });
});
