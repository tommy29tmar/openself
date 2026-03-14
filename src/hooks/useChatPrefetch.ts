"use client";

import { useState, useEffect } from "react";

interface ChatMessage {
  id: string;
  role: string;
  content: string;
}

/**
 * Prefetches chat bootstrap data + message history.
 * Fetched once per language change; shared by desktop and mobile ChatPanel.
 */
export function useChatPrefetch(language: string) {
  const [bootstrapData, setBootstrapData] = useState<Record<string, unknown> | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    (async () => {
      try {
        const [bRes, mRes] = await Promise.all([
          fetch(`/api/chat/bootstrap?language=${language}`, { cache: "no-store", signal: controller.signal }),
          fetch("/api/messages", { cache: "no-store", signal: controller.signal }),
        ]);
        if (cancelled) return;
        if (bRes.status === 401 || mRes.status === 401) {
          window.location.href = "/invite";
          return;
        }
        const bootstrap = bRes.ok ? await bRes.json() : null;
        let msgs: ChatMessage[] = [];
        if (mRes.ok) {
          const data = await mRes.json();
          if (data.success && Array.isArray(data.messages)) {
            msgs = data.messages.filter(
              (m: any) =>
                typeof m.id === "string" &&
                typeof m.role === "string" &&
                typeof m.content === "string" &&
                (m.role === "user" || m.role === "assistant"),
            );
          }
        }
        if (!cancelled) {
          setBootstrapData(bootstrap);
          setInitialMessages(msgs);
        }
      } catch (err) {
        console.warn("[useChatPrefetch] chat data prefetch failed:", err);
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [language]);

  return { bootstrapData, initialMessages, ready };
}
