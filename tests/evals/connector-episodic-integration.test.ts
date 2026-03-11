import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { insertEvent } from "@/lib/services/episodic-service";
import { checkPatternThresholds } from "@/lib/services/episodic-consolidation-service";

describe("connector episodic integration", () => {
  it("connector-sourced events do not trigger Dream Cycle", () => {
    const ownerKey = `integration-test-${randomUUID()}`;

    // Insert 5 workout events from strava (above MIN_EVENTS threshold of 3)
    for (let i = 0; i < 5; i++) {
      insertEvent({
        ownerKey,
        sessionId: "sess",
        eventAtUnix: Math.floor(Date.now() / 1000) - i * 86400,
        eventAtHuman: new Date().toISOString(),
        actionType: "workout",
        narrativeSummary: `Ran ${5 + i}km`,
        source: "strava",
      });
    }

    // Insert 1 workout event from chat (below threshold of 3)
    insertEvent({
      ownerKey,
      sessionId: "sess",
      eventAtUnix: Math.floor(Date.now() / 1000),
      eventAtHuman: new Date().toISOString(),
      actionType: "workout",
      narrativeSummary: "Went for a run",
      source: "chat",
    });

    // Dream Cycle should find 0 candidates for workout
    // (only 1 chat event, threshold is 3; strava events are filtered out)
    const candidates = checkPatternThresholds(ownerKey);
    expect(candidates.filter((c) => c.actionType === "workout")).toHaveLength(0);
  });

  it("chat-sourced events still trigger Dream Cycle normally", () => {
    const ownerKey = `integration-test-${randomUUID()}`;

    // Insert 5 workout events from chat (above threshold)
    for (let i = 0; i < 5; i++) {
      insertEvent({
        ownerKey,
        sessionId: "sess",
        eventAtUnix: Math.floor(Date.now() / 1000) - i * 86400,
        eventAtHuman: new Date().toISOString(),
        actionType: "workout",
        narrativeSummary: `Ran ${5 + i}km`,
        source: "chat",
      });
    }

    // Dream Cycle SHOULD find workout candidates (5 chat events >= threshold 3)
    const candidates = checkPatternThresholds(ownerKey);
    expect(candidates.filter((c) => c.actionType === "workout")).toHaveLength(1);
  });
});
