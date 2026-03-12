import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { sqlite } from "@/lib/db";
import { insertEvent, queryEvents } from "@/lib/services/episodic-service";
import { randomUUID } from "crypto";

const ownerKey = `test-fts-split-${randomUUID()}`;
const fromUnix = Math.floor(Date.now() / 1000) - 3600;
const toUnix = Math.floor(Date.now() / 1000) + 3600;

beforeEach(() => {
  sqlite.exec("DELETE FROM episodic_events WHERE owner_key LIKE 'test-fts-split-%'");
  sqlite.exec("INSERT INTO episodic_events_fts(episodic_events_fts) VALUES('rebuild')");
});

afterAll(() => {
  sqlite.exec("DELETE FROM episodic_events WHERE owner_key LIKE 'test-fts-split-%'");
  sqlite.exec("INSERT INTO episodic_events_fts(episodic_events_fts) VALUES('rebuild')");
});

describe("episodic FTS word-split", () => {
  it("should match multi-word queries in any order", () => {
    insertEvent({
      ownerKey,
      sessionId: "s1",
      eventAtUnix: Math.floor(Date.now() / 1000),
      eventAtHuman: new Date().toISOString(),
      actionType: "workout",
      narrativeSummary: "Completed a marathon training session in the park",
      rawInput: "test",
    });

    const results = queryEvents({ ownerKey, fromUnix, toUnix, keywords: "training marathon" });
    expect(results).toHaveLength(1);
  });

  it("should require ALL words to match (AND semantics)", () => {
    insertEvent({
      ownerKey,
      sessionId: "s1",
      eventAtUnix: Math.floor(Date.now() / 1000),
      eventAtHuman: new Date().toISOString(),
      actionType: "coding",
      narrativeSummary: "Fixed a bug in the authentication module",
      rawInput: "test",
    });

    const results = queryEvents({ ownerKey, fromUnix, toUnix, keywords: "bug cooking" });
    expect(results).toHaveLength(0);
  });
});
