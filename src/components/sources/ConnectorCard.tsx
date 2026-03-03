"use client";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { ConnectorUIDefinition, ConnectorStatusRow } from "@/lib/connectors/types";

type ConnectorCardProps = {
  definition: ConnectorUIDefinition;
  status: ConnectorStatusRow | null;
  onRefresh: () => void;
};

export function ConnectorCard({ definition, status, onRefresh }: ConnectorCardProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const isConnected = status?.status === "connected";
  const hasError = status?.status === "error";

  const handleConnect = () => {
    if (definition.connectUrl) window.location.href = definition.connectUrl;
  };

  const handleSync = async () => {
    if (!definition.syncUrl || loading) return;
    setLoading(true);
    try {
      const res = await fetch(definition.syncUrl, { method: "POST" });
      const data = await res.json();
      setMessage({
        text: data.success ? "Synced" : (data.error ?? "Sync failed"),
        type: data.success ? "success" : "error",
      });
      if (data.success) onRefresh();
    } catch {
      setMessage({ text: "Network error", type: "error" });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDisconnect = async () => {
    if (!status?.id) return;
    const url = definition.disconnectUrl.replace("{id}", String(status.id));
    const res = await fetch(url, { method: "POST" });
    if (res.ok) onRefresh();
  };

  const handleImport = async () => {
    if (!definition.importUrl) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setLoading(true);
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch(definition.importUrl!, { method: "POST", body: form });
        const data = await res.json();
        setMessage({
          text: data.success
            ? `${data.report?.factsWritten ?? 0} facts imported`
            : (data.error ?? "Import failed"),
          type: data.success ? "success" : "error",
        });
        if (data.success) {
          window.dispatchEvent(
            new CustomEvent("openself:import-complete", {
              detail: { factsWritten: data.report?.factsWritten ?? 0 },
            }),
          );
          onRefresh();
        }
      } catch {
        setMessage({ text: "Upload failed", type: "error" });
      } finally {
        setLoading(false);
        setTimeout(() => setMessage(null), 4000);
      }
    };
    input.click();
  };

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: "#e8e4de" }}>
          {definition.displayName}
        </span>
        {isConnected && (
          <span
            style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }}
          />
        )}
        {hasError && (
          <span
            style={{ width: 6, height: 6, borderRadius: "50%", background: "#f87171" }}
          />
        )}
      </div>
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 10 }}>
        {definition.description}
      </p>

      {/* Not connected */}
      {!isConnected && !hasError &&
        (definition.authType === "oauth" ? (
          <button onClick={handleConnect} style={btnStyle("#c9a96e", "#111")}>
            Connect {definition.displayName}
          </button>
        ) : (
          <button
            onClick={handleImport}
            disabled={loading}
            style={btnStyle("rgba(255,255,255,0.1)", "#e8e4de")}
          >
            {loading ? "Importing\u2026" : `Import ${definition.displayName} ZIP`}
          </button>
        ))}

      {/* Connected (OAuth) */}
      {isConnected && definition.authType === "oauth" && (
        <div style={{ display: "flex", gap: 8 }}>
          {definition.syncUrl && (
            <button
              onClick={handleSync}
              disabled={loading}
              style={{ ...btnStyle("rgba(255,255,255,0.08)", "#e8e4de"), flex: 1 }}
            >
              {loading ? "Syncing\u2026" : "Sync Now"}
            </button>
          )}
          <button
            onClick={handleDisconnect}
            style={btnStyle("rgba(239,68,68,0.15)", "#f87171")}
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div>
          <p style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>
            {status?.lastError}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleConnect}
              style={{ ...btnStyle("rgba(255,255,255,0.08)", "#e8e4de"), flex: 1 }}
            >
              Reconnect
            </button>
            <button
              onClick={handleDisconnect}
              style={btnStyle("rgba(239,68,68,0.15)", "#f87171")}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Re-import button for zip — only shown when already imported (isConnected) */}
      {definition.authType === "zip_upload" && isConnected && (
        <button
          onClick={handleImport}
          disabled={loading}
          style={{ ...btnStyle("rgba(255,255,255,0.06)", "#e8e4de"), marginTop: 8, width: "100%" }}
        >
          {loading ? "Importing\u2026" : "Re-import ZIP"}
        </button>
      )}

      {message && (
        <p
          style={{
            fontSize: 11,
            marginTop: 8,
            color: message.type === "success" ? "#4ade80" : "#f87171",
          }}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

function btnStyle(bg: string, color: string): CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    background: bg,
    color,
    border: "none",
    cursor: "pointer",
  };
}
