import { randomUUID } from "node:crypto";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getActiveConnectors, updateConnectorStatus } from "./connector-service";
import { getConnector } from "./registry";
import { db } from "@/lib/db";
import { syncLog } from "@/lib/db/schema";

function insertSyncLog(
  connectorId: string,
  status: "success" | "error" | "partial",
  factsCreated: number,
  factsUpdated: number,
  eventsCreated: number,
  error: string | null,
): void {
  db.insert(syncLog)
    .values({
      id: randomUUID(),
      connectorId,
      status,
      factsCreated,
      factsUpdated,
      eventsCreated,
      error,
    })
    .run();
}

/**
 * Worker handler for `connector_sync` jobs.
 * Fan-out: loads all active connectors for the owner and dispatches by type.
 * When `connectorId` is present in the payload, only that connector is synced
 * (manual sync from UI). When absent, all active connectors are synced
 * (scheduler path).
 */
export async function handleConnectorSync(
  payload: Record<string, unknown>,
): Promise<void> {
  const ownerKey = payload.ownerKey as string;
  if (!ownerKey) throw new Error("connector_sync: missing ownerKey");

  const connectorId = payload.connectorId as string | undefined;

  resolveOwnerScopeForWorker(ownerKey);
  const active = getActiveConnectors(ownerKey);
  const toSync = connectorId
    ? active.filter((c) => c.id === connectorId)
    : active;

  for (const connector of toSync) {
    try {
      const def = getConnector(connector.connectorType);
      if (!def) {
        console.warn(
          `[connector-sync] Unknown type: ${connector.connectorType}`,
        );
        insertSyncLog(
          connector.id,
          "partial",
          0,
          0,
          0,
          `unknown connector type: ${connector.connectorType}`,
        );
        continue;
      }

      if (!def.supportsSync || !def.syncFn) {
        insertSyncLog(connector.id, "partial", 0, 0, 0, "no sync implementation");
        continue;
      }

      const result = await def.syncFn(connector.id, ownerKey);
      insertSyncLog(
        connector.id,
        result.error ? "error" : "success",
        result.factsCreated,
        result.factsUpdated,
        result.eventsCreated ?? 0,
        result.error ?? null,
      );

      if (result.error) {
        updateConnectorStatus(connector.id, "error", result.error);
      } else {
        updateConnectorStatus(connector.id, "connected");
        // Post-sync: trigger fact consolidation if new facts were created
        if (result.factsCreated > 0) {
          try {
            const { enqueueJob } = await import("@/lib/worker/index");
            enqueueJob("consolidate_facts", { ownerKey });
          } catch (err) {
            console.warn("[connector-sync] Failed to enqueue consolidate_facts:", err);
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateConnectorStatus(connector.id, "error", message);
      insertSyncLog(connector.id, "error", 0, 0, 0, message);
    }
  }
}
