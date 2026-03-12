/**
 * Atomic purge of all data imported by a connector.
 * Hard-deletes facts, episodic events, connector_items, and sync_log.
 * Resets connector lastSync/syncCursor for clean reconnect.
 *
 * Uses only relational joins via connector_items — no key prefix heuristics.
 */

import { sqlite } from "@/lib/db";
import { hasPendingJob } from "./idempotency";

export type PurgeResult = {
  factsDeleted: number;
  eventsDeleted: number;
  connectorItemsDeleted: number;
  syncLogsDeleted: number;
};

export function purgeConnectorData(
  connectorId: string,
  ownerKey: string,
): PurgeResult {
  // Guard: reject if ANY sync job is in progress for this owner.
  // Scheduler-triggered jobs don't carry connectorId in payload, so we
  // use hasPendingJob(ownerKey) which checks by ownerKey alone.
  // This is the correct granularity because scheduler syncs ALL connectors.
  if (hasPendingJob(ownerKey)) {
    throw new Error(
      "Cannot purge while a sync is in progress. Wait for the sync to complete or cancel it first.",
    );
  }

  return sqlite.transaction(() => {
    // 1. Collect IDs to delete
    const factIds = sqlite
      .prepare(
        `SELECT fact_id FROM connector_items
         WHERE connector_id = ? AND fact_id IS NOT NULL`,
      )
      .all(connectorId)
      .map((r) => (r as { fact_id: string }).fact_id);

    const eventIds = sqlite
      .prepare(
        `SELECT event_id FROM connector_items
         WHERE connector_id = ? AND event_id IS NOT NULL`,
      )
      .all(connectorId)
      .map((r) => (r as { event_id: string }).event_id);

    // 2. Hard-delete facts (chunked for SQLite 999 param limit)
    let factsDeleted = 0;
    for (let i = 0; i < factIds.length; i += 500) {
      const chunk = factIds.slice(i, i + 500);
      const placeholders = chunk.map(() => "?").join(",");

      // Detach children before delete
      sqlite
        .prepare(
          `UPDATE facts SET parent_fact_id = NULL
           WHERE parent_fact_id IN (${placeholders})`,
        )
        .run(...chunk);

      const result = sqlite
        .prepare(
          `DELETE FROM facts WHERE id IN (${placeholders})`,
        )
        .run(...chunk);
      factsDeleted += result.changes;
    }

    // 3. Hard-delete episodic events (chunked)
    let eventsDeleted = 0;
    for (let i = 0; i < eventIds.length; i += 500) {
      const chunk = eventIds.slice(i, i + 500);
      const placeholders = chunk.map(() => "?").join(",");
      const result = sqlite
        .prepare(
          `DELETE FROM episodic_events WHERE id IN (${placeholders})`,
        )
        .run(...chunk);
      eventsDeleted += result.changes;
    }

    // 4. Delete connector_items
    const ciResult = sqlite
      .prepare(`DELETE FROM connector_items WHERE connector_id = ?`)
      .run(connectorId);

    // 5. Delete sync_log entries
    const slResult = sqlite
      .prepare(`DELETE FROM sync_log WHERE connector_id = ?`)
      .run(connectorId);

    // 6. Reset connector state for clean reconnect
    sqlite
      .prepare(
        `UPDATE connectors
         SET last_sync = NULL, sync_cursor = NULL, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(connectorId);

    return {
      factsDeleted,
      eventsDeleted,
      connectorItemsDeleted: ciResult.changes,
      syncLogsDeleted: slResult.changes,
    };
  })();
}
