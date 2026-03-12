import { insertEvent } from "@/lib/services/episodic-service";
import { sqlite } from "@/lib/db";
import { randomUUID } from "node:crypto";
import type { EpisodicEventInput } from "./types";

type EventWriterContext = {
  ownerKey: string;
  connectorId: string;
  connectorType: string;
  sessionId: string;
};

type EventWriterReport = {
  eventsWritten: number;
  eventsSkipped: number;
  errors: Array<{ externalId: string; reason: string }>;
};

export async function batchRecordEvents(
  events: EpisodicEventInput[],
  ctx: EventWriterContext,
): Promise<EventWriterReport> {
  const report: EventWriterReport = { eventsWritten: 0, eventsSkipped: 0, errors: [] };
  if (events.length === 0) return report;

  // Deduplicate intra-batch
  const uniqueEvents: EpisodicEventInput[] = [];
  const seenInBatch = new Set<string>();
  for (const event of events) {
    if (seenInBatch.has(event.externalId)) {
      report.eventsSkipped++;
      continue;
    }
    seenInBatch.add(event.externalId);
    uniqueEvents.push(event);
  }

  // Batch-check existing external_ids (chunked for SQLite 999 limit)
  const CHUNK_SIZE = 500;
  const existingIds = new Set<string>();
  for (let i = 0; i < uniqueEvents.length; i += CHUNK_SIZE) {
    const chunk = uniqueEvents.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = sqlite
      .prepare(
        `SELECT external_id FROM connector_items
         WHERE connector_id = ? AND external_id IN (${placeholders})`,
      )
      .all(ctx.connectorId, ...chunk.map((e) => e.externalId)) as Array<{ external_id: string }>;
    for (const r of rows) existingIds.add(r.external_id);
  }

  for (const event of uniqueEvents) {
    if (existingIds.has(event.externalId)) {
      report.eventsSkipped++;
      continue;
    }

    try {
      sqlite.exec("BEGIN");
      try {
        const eventId = insertEvent({
          ownerKey: ctx.ownerKey,
          sessionId: ctx.sessionId,
          eventAtUnix: event.eventAtUnix,
          eventAtHuman: event.eventAtHuman,
          actionType: event.actionType,
          narrativeSummary: event.narrativeSummary,
          entities: event.entities ?? [],
          source: ctx.connectorType,
          externalId: event.externalId,
        });

        sqlite
          .prepare(
            `INSERT INTO connector_items (id, connector_id, external_id, event_id, last_seen_at)
             VALUES (?, ?, ?, ?, datetime('now'))
             ON CONFLICT(connector_id, external_id) DO UPDATE SET
               event_id = excluded.event_id, last_seen_at = excluded.last_seen_at`,
          )
          .run(randomUUID(), ctx.connectorId, event.externalId, eventId);

        sqlite.exec("COMMIT");
        report.eventsWritten++;
      } catch (innerError) {
        sqlite.exec("ROLLBACK");
        throw innerError;
      }
    } catch (error) {
      report.errors.push({
        externalId: event.externalId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}
