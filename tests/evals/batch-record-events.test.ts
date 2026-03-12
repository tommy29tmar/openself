// tests/evals/batch-record-events.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { sqlite } from "@/lib/db";
import { batchRecordEvents } from "@/lib/connectors/connector-event-writer";
import { randomUUID } from "crypto";

const PREFIX = "test-batch-evt-";

// Ensure connector parent rows exist for FK constraint
function ensureConnector(connectorId: string): void {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO connectors (id, connector_type, enabled)
       VALUES (?, 'rss', 1)`,
    )
    .run(connectorId);
}

afterAll(() => {
  // Clean up connector_items first (FK child), then connectors (FK parent), then episodic
  const connectorIds = sqlite
    .prepare("SELECT id FROM connectors WHERE id LIKE ?")
    .all(`${PREFIX}%`) as Array<{ id: string }>;
  for (const { id } of connectorIds) {
    sqlite.prepare("DELETE FROM connector_items WHERE connector_id = ?").run(id);
  }
  sqlite.prepare("DELETE FROM connectors WHERE id LIKE ?").run(`${PREFIX}%`);
  sqlite.prepare("DELETE FROM episodic_events WHERE owner_key LIKE ?").run(`${PREFIX}%`);
});

function makeEvent(externalId: string, summary: string) {
  return {
    externalId,
    eventAtUnix: Math.floor(Date.now() / 1000),
    eventAtHuman: new Date().toISOString(),
    actionType: "article",
    narrativeSummary: summary,
  };
}

describe("batchRecordEvents", () => {
  it("should deduplicate within a single batch (intra-batch)", async () => {
    const connectorId = `${PREFIX}${randomUUID()}`;
    const ownerKey = `${PREFIX}owner`;
    const extId = `dup-${randomUUID()}`;
    ensureConnector(connectorId);

    const report = await batchRecordEvents(
      [makeEvent(extId, "Article 1"), makeEvent(extId, "Article 1 duplicate")],
      { ownerKey, connectorId, connectorType: "rss", sessionId: "s1" },
    );

    expect(report.eventsWritten).toBe(1);
    expect(report.eventsSkipped).toBe(1);
    expect(report.errors).toHaveLength(0);
  });

  it("should skip events already in connector_items (cross-batch dedup)", async () => {
    const connectorId = `${PREFIX}${randomUUID()}`;
    const ownerKey = `${PREFIX}owner-cross`;
    ensureConnector(connectorId);

    const extId = `cross-${randomUUID()}`;
    // First batch — writes the event
    const r1 = await batchRecordEvents(
      [makeEvent(extId, "First write")],
      { ownerKey, connectorId, connectorType: "rss", sessionId: "s1" },
    );
    expect(r1.eventsWritten).toBe(1);

    // Second batch — same externalId should be skipped via DB lookup
    const r2 = await batchRecordEvents(
      [makeEvent(extId, "Duplicate write")],
      { ownerKey, connectorId, connectorType: "rss", sessionId: "s1" },
    );
    expect(r2.eventsWritten).toBe(0);
    expect(r2.eventsSkipped).toBe(1);
  });

  it("should handle more than 500 events (chunked dedup)", async () => {
    const connectorId = `${PREFIX}${randomUUID()}`;
    const ownerKey = `${PREFIX}owner-large`;
    ensureConnector(connectorId);

    const events = Array.from({ length: 600 }, (_, i) =>
      makeEvent(`evt-${connectorId}-${i}`, `Event ${i}`),
    );

    const report = await batchRecordEvents(events, {
      ownerKey,
      connectorId,
      connectorType: "rss",
      sessionId: "s1",
    });
    expect(report.eventsWritten).toBe(600);
    expect(report.eventsSkipped).toBe(0);
    expect(report.errors).toHaveLength(0);
  });

  it("should return empty report for empty input", async () => {
    const connectorId = `${PREFIX}${randomUUID()}`;
    const ownerKey = `${PREFIX}owner-empty`;
    ensureConnector(connectorId);

    const report = await batchRecordEvents([], {
      ownerKey,
      connectorId,
      connectorType: "rss",
      sessionId: "s1",
    });
    expect(report.eventsWritten).toBe(0);
    expect(report.eventsSkipped).toBe(0);
    expect(report.errors).toHaveLength(0);
  });
});
