"use client";

import { useState, useEffect, useCallback } from "react";

/* ── Types ── */
export type ConnectorStatusRow = {
  id: string;
  connectorType: string;
  status: string;
  enabled: boolean;
  lastSync: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type ConnectionState = "not_connected" | "connected" | "error";

export type CardState = {
  connectionState: ConnectionState;
  connectorId: string | null;
  lastSync: string | null;
  lastError: string | null;
};

/* ── Exported helpers (testable) ── */

export async function getConnectorStatuses(): Promise<ConnectorStatusRow[]> {
  try {
    const res = await fetch("/api/connectors/status");
    if (!res.ok) return [];
    const data = await res.json();
    return data.success ? data.connectors : [];
  } catch {
    return [];
  }
}

export function deriveCardState(
  connectorType: string,
  connectors: ConnectorStatusRow[],
): CardState {
  const match = connectors.find(
    (c) => c.connectorType === connectorType && c.status !== "disconnected",
  );
  if (!match) {
    return {
      connectionState: "not_connected",
      connectorId: null,
      lastSync: null,
      lastError: null,
    };
  }
  return {
    connectionState: match.status === "error" ? "error" : "connected",
    connectorId: match.id,
    lastSync: match.lastSync,
    lastError: match.lastError,
  };
}

/* ── Disconnect helper ── */
async function disconnectConnector(connectorId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/connectors/${connectorId}/disconnect`, {
      method: "POST",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ── Sync helper ── */
async function triggerSync(): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/connectors/github/sync", { method: "POST" });
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch {
    return { success: false, error: "Network error" };
  }
}

/* ── LinkedIn import helper ── */
async function importLinkedIn(
  file: File,
): Promise<{
  success: boolean;
  report?: { factsWritten: number; factsSkipped: number };
  error?: string;
}> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/connectors/linkedin-zip/import", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    return data;
  } catch {
    return { success: false, error: "Upload failed" };
  }
}

/* ── GitHub Card ── */
function GitHubCard({
  state,
  onRefresh,
}: {
  state: CardState;
  onRefresh: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncCooldown, setSyncCooldown] = useState(false);
  const [disconnectError, setDisconnectError] = useState(false);

  const handleConnect = () => {
    window.location.href = "/api/connectors/github/connect";
  };

  const handleSync = async () => {
    if (syncing || syncCooldown) return;
    setSyncing(true);
    await triggerSync();
    setTimeout(() => {
      setSyncing(false);
      setSyncCooldown(true);
      onRefresh();
      setTimeout(() => setSyncCooldown(false), 60_000);
    }, 2000);
  };

  const handleDisconnect = async () => {
    if (!state.connectorId) return;
    const ok = await disconnectConnector(state.connectorId);
    if (ok) {
      onRefresh();
    } else {
      setDisconnectError(true);
      setTimeout(() => setDisconnectError(false), 3000);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--page-border,#e5e5e5)] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">GitHub</span>
          {state.connectionState === "connected" && (
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          )}
          {state.connectionState === "error" && (
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          )}
        </div>
      </div>

      {state.connectionState === "not_connected" && (
        <button
          onClick={handleConnect}
          className="w-full mt-2 px-3 py-1.5 text-xs font-medium rounded bg-[var(--page-fg,#111)] text-[var(--page-bg,#fff)] hover:opacity-80 transition-opacity"
        >
          Connect GitHub
        </button>
      )}

      {state.connectionState === "connected" && (
        <div className="space-y-2">
          {state.lastSync && (
            <p className="text-[11px] text-[var(--page-fg-secondary,#666)]">
              Last sync: {new Date(state.lastSync).toLocaleDateString()}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing || syncCooldown}
              className="flex-1 px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-[var(--page-bg-secondary,#f5f5f5)] transition-colors disabled:opacity-40"
            >
              {syncing ? "Syncing\u2026" : "Sync Now"}
            </button>
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
            >
              Disconnect
            </button>
          </div>
          {disconnectError && <p className="text-[11px] text-red-600 mt-1">Disconnect failed</p>}
        </div>
      )}

      {state.connectionState === "error" && (
        <div className="space-y-2">
          <p className="text-[11px] text-red-600">{state.lastError}</p>
          <div className="flex gap-2">
            <button
              onClick={handleConnect}
              className="flex-1 px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-[var(--page-bg-secondary,#f5f5f5)] transition-colors"
            >
              Reconnect
            </button>
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
            >
              Disconnect
            </button>
          </div>
          {disconnectError && <p className="text-[11px] text-red-600 mt-1">Disconnect failed</p>}
        </div>
      )}
    </div>
  );
}

/* ── LinkedIn Card ── */
function LinkedInCard({ onRefresh }: { onRefresh: () => void }) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    factsWritten?: number;
    error?: string;
  } | null>(null);

  const handleImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setImporting(true);
      setResult(null);
      const res = await importLinkedIn(file);
      setImporting(false);
      if (res.success && res.report) {
        setResult({ factsWritten: res.report.factsWritten });
        onRefresh();
      } else {
        setResult({ error: res.error ?? "Import failed" });
      }
    };
    input.click();
  };

  return (
    <div className="rounded-lg border border-[var(--page-border,#e5e5e5)] p-4">
      <div className="mb-2">
        <span className="font-medium text-sm">LinkedIn</span>
      </div>
      <p className="text-[11px] text-[var(--page-fg-secondary,#666)] mb-3">
        Upload your LinkedIn data export (ZIP)
      </p>
      <button
        onClick={handleImport}
        disabled={importing}
        className="w-full px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-[var(--page-bg-secondary,#f5f5f5)] transition-colors disabled:opacity-40"
      >
        {importing ? "Importing\u2026" : "Import LinkedIn ZIP"}
      </button>
      {result?.factsWritten !== undefined && (
        <p className="mt-2 text-[11px] text-green-600">
          {result.factsWritten} facts imported
        </p>
      )}
      {result?.error && (
        <p className="mt-2 text-[11px] text-red-600">{result.error}</p>
      )}
    </div>
  );
}

/* ── Main Section ── */
export function ConnectorSection() {
  const [connectors, setConnectors] = useState<ConnectorStatusRow[]>([]);

  const refresh = useCallback(async () => {
    const statuses = await getConnectorStatuses();
    setConnectors(statuses);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const githubState = deriveCardState("github", connectors);

  return (
    <div className="flex flex-col gap-3">
      <GitHubCard state={githubState} onRefresh={refresh} />
      <LinkedInCard onRefresh={refresh} />
    </div>
  );
}
