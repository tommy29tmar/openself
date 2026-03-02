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
  error: string | null,
): void {
  db.insert(syncLog)
    .values({
      id: randomUUID(),
      connectorId,
      status,
      factsCreated,
      factsUpdated,
      error,
    })
    .run();
}

/**
 * Worker handler for `connector_sync` jobs.
 * Fan-out: loads all active connectors for the owner and dispatches by type.
 * Each connector type handler will be implemented in Milestone B/C.
 */
export async function handleConnectorSync(
  payload: Record<string, unknown>,
): Promise<void> {
  const ownerKey = payload.ownerKey as string;
  if (!ownerKey) throw new Error("connector_sync: missing ownerKey");

  resolveOwnerScopeForWorker(ownerKey);
  const active = getActiveConnectors(ownerKey);

  for (const connector of active) {
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
          `unknown connector type: ${connector.connectorType}`,
        );
        continue;
      }

      if (!def.supportsSync || !def.syncFn) {
        insertSyncLog(connector.id, "partial", 0, 0, "no sync implementation");
        continue;
      }

      const result = await def.syncFn(connector.id, ownerKey);
      insertSyncLog(
        connector.id,
        result.error ? "error" : "success",
        result.factsCreated,
        result.factsUpdated,
        result.error ?? null,
      );

      if (result.error) {
        updateConnectorStatus(connector.id, "error", result.error);
      } else {
        updateConnectorStatus(connector.id, "connected");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateConnectorStatus(connector.id, "error", message);
      insertSyncLog(connector.id, "error", 0, 0, message);
    }
  }
}
