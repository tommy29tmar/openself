// tests/evals/episodic-consolidation.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { sqlite } from "@/lib/db";
import { insertEvent } from "@/lib/services/episodic-service";

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

beforeEach(() => {
  sqlite.exec("DELETE FROM episodic_events");
  sqlite.exec("DELETE FROM episodic_pattern_proposals");
  sqlite.exec("DELETE FROM jobs WHERE job_type = 'consolidate_episodes'");
  sqlite.exec("INSERT INTO episodic_events_fts(episodic_events_fts) VALUES('delete-all')");
  vi.clearAllMocks();
});

function insertWorkouts(ownerKey: string, count: number, maxAgeDays = 50) {
  for (let i = 0; i < count; i++) {
    const unix = NOW - Math.floor((i / Math.max(count - 1, 1)) * maxAgeDays * DAY);
    insertEvent({ ownerKey, sessionId: "s1", eventAtUnix: unix,
      eventAtHuman: new Date(unix * 1000).toISOString(),
      actionType: "workout", narrativeSummary: `Run #${i + 1}`, rawInput: "ran" });
  }
}

describe("checkPatternThresholds", () => {
  it("detects pattern with ≥3 events in 60d and 1 in last 30d", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    insertWorkouts("o1", 4, 50);
    expect(checkPatternThresholds("o1").some(p => p.actionType === "workout")).toBe(true);
  });

  it("returns nothing when all events older than 30d", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    for (let i = 0; i < 4; i++) {
      const unix = NOW - (40 + i) * DAY;
      insertEvent({ ownerKey: "o2", sessionId: "s1", eventAtUnix: unix,
        eventAtHuman: new Date(unix * 1000).toISOString(), actionType: "workout", narrativeSummary: "old", rawInput: "r" });
    }
    expect(checkPatternThresholds("o2").length).toBe(0);
  });

  it("returns nothing for fewer than 3 events", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    insertWorkouts("o3", 2, 10);
    expect(checkPatternThresholds("o3").length).toBe(0);
  });

  it("skips action_type on rejection cooldown", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    insertWorkouts("o4", 5, 20);
    const propId = insertEpisodicProposal({ ownerKey: "o4", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: NOW });
    resolveEpisodicProposal(propId, "o4", false);
    expect(checkPatternThresholds("o4").length).toBe(0);
  });

  it("skips action_type with pending proposal", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    const { insertEpisodicProposal } = await import("@/lib/services/episodic-service");
    insertWorkouts("o5", 5, 20);
    insertEpisodicProposal({ ownerKey: "o5", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: NOW });
    expect(checkPatternThresholds("o5").length).toBe(0);
  });

  it("skips action_type with accepted proposal — habit already in profile", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    insertWorkouts("o6", 5, 20);
    const propId = insertEpisodicProposal({ ownerKey: "o6", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: NOW });
    resolveEpisodicProposal(propId, "o6", true);
    expect(checkPatternThresholds("o6").length).toBe(0);
  });

  it("R6-3: does NOT block on expired pending proposals (julianday expiry check in query)", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    const { insertEpisodicProposal } = await import("@/lib/services/episodic-service");
    insertWorkouts("o7", 5, 20);
    const propId = insertEpisodicProposal({ ownerKey: "o7", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: NOW });
    sqlite.prepare("UPDATE episodic_pattern_proposals SET expires_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 86400_000).toISOString(), propId);
    expect(checkPatternThresholds("o7").some(p => p.actionType === "workout")).toBe(true);
  });

  it("excludes connector-sourced events from pattern detection", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    // Insert 5 'workout' events with source='strava' (above MIN_EVENTS threshold)
    for (let i = 0; i < 5; i++) {
      insertEvent({
        ownerKey: "test-owner-source-filter",
        sessionId: "sess",
        eventAtUnix: Math.floor(Date.now() / 1000) - i * DAY,
        eventAtHuman: new Date().toISOString(),
        actionType: "workout",
        narrativeSummary: "Ran 5km",
        source: "strava",
      });
    }

    const candidates = checkPatternThresholds("test-owner-source-filter");
    // Should find 0 candidates — all events are source='strava', not 'chat'
    expect(candidates).toHaveLength(0);
  });
});
