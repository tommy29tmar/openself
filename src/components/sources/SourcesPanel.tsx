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
