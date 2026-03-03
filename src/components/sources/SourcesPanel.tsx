"use client";
import { useState, useEffect, useCallback } from "react";
import { listConnectorUIs } from "@/lib/connectors/ui-registry";
import { ConnectorCard } from "./ConnectorCard";
import type { ConnectorStatusRow } from "@/lib/connectors/types";

async function fetchStatuses(): Promise<ConnectorStatusRow[]> {
  try {
    const res = await fetch("/api/connectors/status");
    if (!res.ok) return [];
    const data = await res.json();
    return data.success ? data.connectors : [];
  } catch {
    return [];
  }
}

/** Pure utility exported for testing: fetch connector statuses from the API. */
export async function getConnectorStatuses(): Promise<ConnectorStatusRow[]> {
  return fetchStatuses();
}

export type CardState = {
  connectionState: "connected" | "error" | "not_connected";
  lastSync: string | null;
  lastError: string | null;
};

/** Pure utility exported for testing: derive card state from connector type + status list. */
export function deriveCardState(
  connectorType: string,
  statuses: ConnectorStatusRow[],
): CardState {
  const row = statuses.find(
    (s) => s.connectorType === connectorType && s.status !== "disconnected",
  );
  if (!row) {
    return { connectionState: "not_connected", lastSync: null, lastError: null };
  }
  if (row.status === "connected") {
    return { connectionState: "connected", lastSync: row.lastSync, lastError: null };
  }
  if (row.status === "error") {
    return { connectionState: "error", lastSync: row.lastSync, lastError: row.lastError };
  }
  return { connectionState: "not_connected", lastSync: null, lastError: null };
}

export function SourcesPanel() {
  const [statuses, setStatuses] = useState<ConnectorStatusRow[]>([]);
  const definitions = listConnectorUIs();

  const refresh = useCallback(async () => {
    setStatuses(await fetchStatuses());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      {definitions.map((def) => {
        const status =
          statuses.find(
            (s) => s.connectorType === def.id && s.status !== "disconnected",
          ) ?? null;
        return (
          <ConnectorCard
            key={def.id}
            definition={def}
            status={status}
            onRefresh={refresh}
          />
        );
      })}
    </div>
  );
}

// Legacy alias — PresencePanel imports ConnectorSection from this file
export { SourcesPanel as ConnectorSection };
