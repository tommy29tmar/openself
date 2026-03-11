import { describe, it, expect, afterAll } from "vitest";
import { insertEvent, getRecentEventsForContext } from "@/lib/services/episodic-service";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

function uniqueOwner() {
  return `test-epi-ctx-${randomUUID()}`;
}

afterAll(() => {
  sqlite.prepare("DELETE FROM episodic_events WHERE owner_key LIKE 'test-epi-ctx-%'").run();
});

describe("getRecentEventsForContext", () => {
  it("returns empty array when no events exist", () => {
    const result = getRecentEventsForContext(uniqueOwner());
    expect(result).toEqual([]);
  });

  it("returns events within 30-day window", () => {
    const owner = uniqueOwner();
    const now = Math.floor(Date.now() / 1000);
    insertEvent({
      ownerKey: owner, sessionId: "s1",
      eventAtUnix: now - 86400, eventAtHuman: new Date((now - 86400) * 1000).toISOString(),
      actionType: "workout", narrativeSummary: "Ran 5km",
    });
    insertEvent({
      ownerKey: owner, sessionId: "s1",
      eventAtUnix: now - 40 * 86400, eventAtHuman: "old",
      actionType: "workout", narrativeSummary: "Old run (outside window)",
    });
    const result = getRecentEventsForContext(owner);
    expect(result.length).toBe(1);
    expect(result[0].narrativeSummary).toBe("Ran 5km");
  });

  it("applies per-source caps: max 10 chat, max 3 per connector", () => {
    const owner = uniqueOwner();
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 12; i++) {
      insertEvent({
        ownerKey: owner, sessionId: "s1",
        eventAtUnix: now - i * 3600, eventAtHuman: "h",
        actionType: "social", narrativeSummary: `Chat event ${i}`,
        source: "chat",
      });
    }
    for (let i = 0; i < 5; i++) {
      insertEvent({
        ownerKey: owner, sessionId: "s1",
        eventAtUnix: now - i * 3600, eventAtHuman: "h",
        actionType: "code", narrativeSummary: `GH event ${i}`,
        source: "github",
      });
    }
    const result = getRecentEventsForContext(owner);
    const chatEvents = result.filter(e => e.source === "chat");
    const ghEvents = result.filter(e => e.source === "github");
    expect(chatEvents.length).toBeLessThanOrEqual(10);
    expect(ghEvents.length).toBeLessThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(15);
  });

  it("sorts by recency (most recent first)", () => {
    const owner = uniqueOwner();
    const now = Math.floor(Date.now() / 1000);
    insertEvent({
      ownerKey: owner, sessionId: "s1",
      eventAtUnix: now - 86400 * 2, eventAtHuman: "h",
      actionType: "workout", narrativeSummary: "Older run",
    });
    insertEvent({
      ownerKey: owner, sessionId: "s1",
      eventAtUnix: now - 3600, eventAtHuman: "h",
      actionType: "workout", narrativeSummary: "Recent run",
    });
    const result = getRecentEventsForContext(owner);
    expect(result[0].narrativeSummary).toBe("Recent run");
  });
});
