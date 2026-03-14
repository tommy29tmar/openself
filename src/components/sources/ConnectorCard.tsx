"use client";
import { useState, useRef, useEffect } from "react";
import type { CSSProperties } from "react";
import type { ConnectorUIDefinition, ConnectorStatusRow } from "@/lib/connectors/types";
import { preflightConnectCheck } from "@/lib/connectors/preflight";

type ConnectorCardProps = {
  definition: ConnectorUIDefinition;
  status: ConnectorStatusRow | null;
  onRefresh: () => void;
};

export function ConnectorCard({ definition, status, onRefresh }: ConnectorCardProps) {
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [feedUrl, setFeedUrl] = useState("");
  const [changingUrl, setChangingUrl] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, []);

  const showMessage = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    messageTimerRef.current = setTimeout(() => setMessage(null), type === "error" ? 4000 : 3000);
  };

  const isConnected = status?.status === "connected";
  const hasError = status?.status === "error";

  const handleConnect = async () => {
    if (!definition.connectUrl || loading) return;
    setLoading(true);
    try {
      const result = await preflightConnectCheck(definition.connectUrl);
      if (!result.ok) {
        showMessage(result.error, "error");
        return;
      }
      window.location.href = definition.connectUrl;
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!definition.syncUrl || loading) return;
    setLoading(true);
    try {
      const res = await fetch(definition.syncUrl, { method: "POST" });
      const data = await res.json();
      showMessage(
        data.success ? "Synced" : (data.error ?? "Sync failed"),
        data.success ? "success" : "error",
      );
      if (data.success) onRefresh();
    } catch {
      showMessage("Network error", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (purge: boolean) => {
    if (!status?.id || disconnecting) return;
    setDisconnecting(true);
    try {
      const url = definition.disconnectUrl.replace("{id}", String(status.id));
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purge }),
      });
      if (res.ok) {
        const data = await res.json();
        if (purge && data.factsRemoved > 0) {
          showMessage(`Removed ${data.factsRemoved} facts, ${data.eventsRemoved} events`, "success");
        }
        onRefresh();
      } else {
        const data = await res.json().catch(() => ({}));
        showMessage(data.error ?? "Disconnect failed", "error");
      }
    } catch {
      showMessage("Network error", "error");
    } finally {
      setDisconnecting(false);
      setConfirmingDisconnect(false);
    }
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
        showMessage(
          data.success
            ? `${data.report?.factsWritten ?? 0} facts imported`
            : (data.error ?? "Import failed"),
          data.success ? "success" : "error",
        );
        if (data.success) {
          window.dispatchEvent(
            new CustomEvent("openself:import-complete", {
              detail: { factsWritten: data.report?.factsWritten ?? 0 },
            }),
          );
          onRefresh();
        }
      } catch {
        showMessage("Upload failed", "error");
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  const handleSubscribe = async () => {
    if (!feedUrl.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/connectors/rss/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: feedUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Subscribe failed");
      showMessage("Feed subscribed!", "success");
      setFeedUrl("");
      setChangingUrl(false);
      onRefresh();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Subscribe failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const disconnectConfirmPanel = (
    <div style={{
      padding: "10px 12px",
      borderRadius: 8,
      background: "rgba(239,68,68,0.08)",
      border: "1px solid rgba(239,68,68,0.2)",
    }}>
      <p style={{ fontSize: 11, color: "#e8e4de", marginBottom: 8 }}>
        Remove imported content too?
        {definition.authType === "zip_upload" && (
          <span style={{ display: "block", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            Data will require re-uploading the ZIP to restore.
          </span>
        )}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => handleDisconnect(false)}
          disabled={disconnecting}
          style={{ ...btnStyle("rgba(255,255,255,0.08)", "#e8e4de"), flex: 1 }}
        >
          {disconnecting ? "\u2026" : "Keep data"}
        </button>
        <button
          type="button"
          onClick={() => handleDisconnect(true)}
          disabled={disconnecting}
          style={{ ...btnStyle("rgba(239,68,68,0.25)", "#f87171"), flex: 1 }}
        >
          {disconnecting ? "\u2026" : "Remove all"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDisconnect(false)}
          disabled={disconnecting}
          style={btnStyle("transparent", "rgba(255,255,255,0.3)")}
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>
    </div>
  );

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
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: status?.lastSync ? 4 : 10 }}>
        {definition.description}
      </p>
      {status?.lastSync && (
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 10 }}>
          Last sync: {relativeTime(status.lastSync)}
        </p>
      )}

      {/* Not connected */}
      {!isConnected && !hasError && definition.authType === "oauth" && (
        <button
          onClick={handleConnect}
          disabled={loading}
          style={{
            ...btnStyle("#c9a96e", "#111"),
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "Connecting\u2026" : `Connect ${definition.displayName}`}
        </button>
      )}
      {!isConnected && !hasError && definition.authType === "zip_upload" && (
        <button
          onClick={handleImport}
          disabled={loading}
          style={btnStyle("rgba(255,255,255,0.1)", "#e8e4de")}
        >
          {loading ? "Importing\u2026" : `Import ${definition.displayName} ZIP`}
        </button>
      )}
      {!isConnected && !hasError && definition.authType === "url_input" && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="url"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://example.com/feed"
            onKeyDown={(e) => { if (e.key === "Enter") handleSubscribe(); }}
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 6,
              fontSize: 11,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#e8e4de",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={loading || !feedUrl.trim()}
            style={{
              ...btnStyle("#c9a96e", "#111"),
              opacity: loading || !feedUrl.trim() ? 0.5 : 1,
            }}
          >
            {loading ? "Subscribing\u2026" : "Subscribe"}
          </button>
        </div>
      )}

      {/* Connected (OAuth) */}
      {isConnected && definition.authType === "oauth" && (
        <div style={{ display: "flex", gap: 8 }}>
          {definition.syncUrl && (
            <button
              onClick={handleSync}
              disabled={loading || disconnecting}
              style={{ ...btnStyle("rgba(255,255,255,0.08)", "#e8e4de"), flex: 1 }}
            >
              {loading ? "Syncing\u2026" : "Sync Now"}
            </button>
          )}
          {confirmingDisconnect ? disconnectConfirmPanel : (
            <button
              type="button"
              onClick={() => setConfirmingDisconnect(true)}
              disabled={disconnecting || loading}
              style={btnStyle("rgba(239,68,68,0.15)", "#f87171")}
            >
              Disconnect
            </button>
          )}
        </div>
      )}

      {/* Connected (url_input) */}
      {isConnected && definition.authType === "url_input" && (
        <div>
          <div style={{ display: "flex", gap: 8 }}>
            {definition.syncUrl && (
              <button
                onClick={handleSync}
                disabled={loading || disconnecting}
                style={{ ...btnStyle("rgba(255,255,255,0.08)", "#e8e4de"), flex: 1 }}
              >
                {loading ? "Syncing\u2026" : "Sync Now"}
              </button>
            )}
            {confirmingDisconnect ? disconnectConfirmPanel : (
              <button
                type="button"
                onClick={() => setConfirmingDisconnect(true)}
                disabled={disconnecting || loading}
                style={btnStyle("rgba(239,68,68,0.15)", "#f87171")}
              >
                Disconnect
              </button>
            )}
          </div>
          {changingUrl ? (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                type="url"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://example.com/feed"
                onKeyDown={(e) => { if (e.key === "Enter") handleSubscribe(); }}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#e8e4de",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={handleSubscribe}
                disabled={loading || !feedUrl.trim()}
                style={{
                  ...btnStyle("#c9a96e", "#111"),
                  opacity: loading || !feedUrl.trim() ? 0.5 : 1,
                }}
              >
                {loading ? "Subscribing\u2026" : "Subscribe"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setChangingUrl(true)}
              style={{ ...btnStyle("rgba(255,255,255,0.06)", "#e8e4de"), marginTop: 8, width: "100%" }}
            >
              Change URL
            </button>
          )}
        </div>
      )}

      {/* Error state (oauth / zip_upload) */}
      {hasError && definition.authType !== "url_input" && (
        <div>
          <p style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>
            {status?.lastError}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleConnect}
              disabled={loading}
              style={{ ...btnStyle("rgba(255,255,255,0.08)", "#e8e4de"), flex: 1, opacity: loading ? 0.5 : 1 }}
            >
              {loading ? "Connecting\u2026" : "Reconnect"}
            </button>
            {confirmingDisconnect ? disconnectConfirmPanel : (
              <button
                type="button"
                onClick={() => setConfirmingDisconnect(true)}
                disabled={disconnecting}
                style={btnStyle("rgba(239,68,68,0.15)", "#f87171")}
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error state (url_input) */}
      {hasError && definition.authType === "url_input" && (
        <div>
          <p style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>
            {status?.lastError}
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {definition.syncUrl && (
              <button
                onClick={handleSync}
                disabled={loading || disconnecting}
                style={{ ...btnStyle("rgba(255,255,255,0.08)", "#e8e4de"), flex: 1 }}
              >
                {loading ? "Syncing\u2026" : "Retry Sync"}
              </button>
            )}
            {confirmingDisconnect ? disconnectConfirmPanel : (
              <button
                type="button"
                onClick={() => setConfirmingDisconnect(true)}
                disabled={disconnecting || loading}
                style={btnStyle("rgba(239,68,68,0.15)", "#f87171")}
              >
                Disconnect
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="url"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="https://example.com/feed"
              onKeyDown={(e) => { if (e.key === "Enter") handleSubscribe(); }}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: 6,
                fontSize: 11,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#e8e4de",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={loading || !feedUrl.trim()}
              style={{
                ...btnStyle("#c9a96e", "#111"),
                opacity: loading || !feedUrl.trim() ? 0.5 : 1,
              }}
            >
              {loading ? "Subscribing\u2026" : "Change URL"}
            </button>
          </div>
        </div>
      )}

      {/* Re-import + disconnect for zip — only shown when already imported (isConnected) */}
      {definition.authType === "zip_upload" && isConnected && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={handleImport}
            disabled={loading}
            style={{ ...btnStyle("rgba(255,255,255,0.06)", "#e8e4de"), width: "100%", marginBottom: 8 }}
          >
            {loading ? "Importing\u2026" : "Re-import ZIP"}
          </button>
          {confirmingDisconnect ? disconnectConfirmPanel : (
            <button
              type="button"
              onClick={() => setConfirmingDisconnect(true)}
              disabled={disconnecting || loading}
              style={{ ...btnStyle("rgba(239,68,68,0.15)", "#f87171"), width: "100%" }}
            >
              Disconnect
            </button>
          )}
        </div>
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

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
