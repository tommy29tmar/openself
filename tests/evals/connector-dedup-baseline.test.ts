import { describe, it, expect, afterAll } from "vitest";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";
import { batchRecordEvents } from "@/lib/connectors/connector-event-writer";

const TEST_PREFIX = "test-dedup-baseline-";

afterAll(() => {
  sqlite.prepare("DELETE FROM connector_items WHERE connector_id LIKE ?").run(`${TEST_PREFIX}%`);
  sqlite.prepare("DELETE FROM episodic_events WHERE owner_key LIKE ?").run(`${TEST_PREFIX}%`);
  sqlite.prepare("DELETE FROM connectors WHERE id LIKE ?").run(`${TEST_PREFIX}%`);
});

describe("connector dedup baseline", () => {
  it("should NOT re-emit events for baseline connector_items (no event_id)", async () => {
    const connectorId = `${TEST_PREFIX}${randomUUID()}`;
    const ownerKey = `${TEST_PREFIX}owner`;
    const externalId = "rss-post-abc123";

    // Insert a real connector row to satisfy FK constraint
    sqlite.prepare(
      `INSERT INTO connectors (id, connector_type, owner_key, status)
       VALUES (?, 'rss', ?, 'connected')`
    ).run(connectorId, ownerKey);

    // Seed a baseline connector_item WITHOUT event_id (simulates first-sync)
    sqlite.prepare(
      `INSERT INTO connector_items (id, connector_id, external_id, last_seen_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).run(randomUUID(), connectorId, externalId);

    // Try to write an event with the same externalId
    const report = await batchRecordEvents(
      [{
        externalId,
        eventAtUnix: Math.floor(Date.now() / 1000),
        eventAtHuman: new Date().toISOString(),
        actionType: "new_article",
        narrativeSummary: "Article about testing",
      }],
      {
        ownerKey,
        connectorId,
        connectorType: "rss",
        sessionId: "s1",
      },
    );

    expect(report.eventsSkipped).toBe(1);
    expect(report.eventsWritten).toBe(0);
  });
});
