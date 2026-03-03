"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PageConfig, StyleConfig } from "@/lib/page-config/schema";
import type { LanguageCode } from "@/lib/i18n/languages";
import type { LayoutTemplateId } from "@/lib/layout/contracts";
import type { AuthState } from "@/app/builder/page";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { PresencePanel } from "@/components/presence/PresencePanel";
import { SignupModal } from "@/components/auth/SignupModal";
import { BuilderNavBar } from "@/components/layout/BuilderNavBar";
import { ProposalBanner } from "@/components/builder/ProposalBanner";
import { PageRenderer } from "@/components/page";
import { getUiL10n } from "@/lib/i18n/ui-strings";
import { HERO_NAME_FALLBACKS } from "@/lib/i18n/hero-fallbacks";
import { friendlyError } from "@/lib/i18n/error-messages";
import { VoiceProvider } from "@/components/voice/VoiceProvider";
import { VoiceOverlay } from "@/components/voice/VoiceOverlay";
import { isVoiceEnabled } from "@/lib/voice/feature-flags";
import { useIsMobile } from "@/hooks/useIsMobile";

type SplitViewProps = {
  language: string;
  onLanguageChange?: (lang: LanguageCode) => void;
  initialConfig?: PageConfig | null;
  authState?: AuthState;
  publishedConfigHash?: string | null;
  onPublishedConfigHashChange?: (hash: string | null) => void;
  openSettings?: boolean;
};

const POLL_INTERVAL = 3000; // 3 seconds

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function PreviewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
    </svg>
  );
}
function StyleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  );
}

function EmptyPreview({ language }: { language: string }) {
  const t = getUiL10n(language);
  return (
    <div className="flex h-full items-center justify-center text-center">
      <div className="max-w-xs space-y-2">
        <p className="text-lg font-medium text-muted-foreground">
          {t.pageWillAppear}
        </p>
        <p className="text-sm text-muted-foreground">
          {t.startChatting}
        </p>
      </div>
    </div>
  );
}

/** Derive a username suggestion from the hero name in the config. */
function deriveUsernameFromConfig(config: PageConfig | null): string {
  const hero = config?.sections?.find((s) => s.type === "hero");
  const name = (hero?.content as Record<string, unknown>)?.name;
  if (!name || typeof name !== "string") return "";
  if (HERO_NAME_FALLBACKS.has(name)) return "";
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
  return slug.length >= 3 ? slug : "";
}

async function persistStyle(patch: {
  surface?: string;
  voice?: string;
  light?: string;
  style?: Partial<StyleConfig>;
  layoutTemplate?: string;
}): Promise<boolean> {
  try {
    const res = await fetch("/api/draft/style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.status === 401) {
      window.location.href = "/invite";
      return false;
    }
    if (!res.ok) {
      console.warn("[settings] Failed to persist style:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[settings] Failed to persist style:", err);
    return false;
  }
}



export function SplitView({
  language,
  onLanguageChange,
  initialConfig,
  authState,
  publishedConfigHash,
  onPublishedConfigHashChange,
  openSettings,
}: SplitViewProps) {
  const isMobile = useIsMobile();
  const voiceEnabled = isVoiceEnabled();

  // Lifted chat data fetching — bootstrap + messages fetched once, shared by both ChatPanel instances
  const [bootstrapData, setBootstrapData] = useState<Record<string, unknown> | null>(null);
  const [chatInitialMessages, setChatInitialMessages] = useState<Array<{id: string; role: string; content: string}>>([]);
  const [chatDataReady, setChatDataReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    (async () => {
      try {
        const [bRes, mRes] = await Promise.all([
          fetch("/api/chat/bootstrap", { cache: "no-store", signal: controller.signal }),
          fetch("/api/messages", { cache: "no-store", signal: controller.signal }),
        ]);
        if (cancelled) return;
        // Redirect to invite page on 401 (unauthenticated)
        if (bRes.status === 401 || mRes.status === 401) {
          window.location.href = "/invite";
          return;
        }
        const bootstrap = bRes.ok ? await bRes.json() : null;
        let msgs: Array<{id: string; role: string; content: string}> = [];
        if (mRes.ok) {
          const data = await mRes.json();
          if (data.success && Array.isArray(data.messages)) {
            msgs = data.messages.filter(
              (m: any) => typeof m.id === "string" && typeof m.role === "string" && typeof m.content === "string" && (m.role === "user" || m.role === "assistant")
            );
          }
        }
        if (!cancelled) {
          setBootstrapData(bootstrap);
          setChatInitialMessages(msgs);
        }
      } catch (err) {
        console.warn("[SplitView] chat data prefetch failed:", err);
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setChatDataReady(true);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [language]);

  const [config, setConfig] = useState<PageConfig | null>(initialConfig ?? null);
  const [configHash, setConfigHash] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<string>("draft");
  const [publishUsername, setPublishUsername] = useState<string>("");
  const [surface, setSurface] = useState(config?.surface ?? "canvas");
  const [voice, setVoice] = useState(config?.voice ?? "signal");
  const [light, setLight] = useState<"day" | "night">((config?.light as "day" | "night") ?? "day");
  const [layoutTemplate, setLayoutTemplate] = useState<LayoutTemplateId>(
    (config?.layoutTemplate as LayoutTemplateId) ?? "monolith",
  );
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<"chat" | "preview" | "style">("chat");

  // Auto-open presence when returning from OAuth connector flow
  useEffect(() => {
    if (openSettings) {
      setPresenceOpen(true);
    }
  }, [openSettings]);

  // Lifted publish / signup state
  const [signupOpen, setSignupOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Username input for authenticated-but-no-username (OAuth edge case)
  const [usernameInputOpen, setUsernameInputOpen] = useState(false);
  const [pendingUsername, setPendingUsername] = useState("");

  // Tracks the last user-initiated style edit
  const lastUserEdit = useRef(0);

  // Change detection: draft differs from published
  const hasUnpublishedChanges = Boolean(
    configHash && (
      (publishedConfigHash && configHash !== publishedConfigHash) ||
      (!publishedConfigHash && config) // first publish: draft exists, never published
    )
  );

  const t = getUiL10n(language);

  const doPublish = async (username: string) => {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, expectedHash: configHash }),
      });
      if (res.status === 401) {
        window.location.href = "/invite";
        return;
      }
      const data = await res.json();
      if (data.success) {
        // Sync hashes so button disappears
        onPublishedConfigHashChange?.(configHash);
        window.location.href = data.url;
      } else {
        setPublishError(friendlyError(data.code, t));
      }
    } catch {
      setPublishError(t.networkError);
    } finally {
      setPublishing(false);
    }
  };

  const handlePublish = () => {
    const username = authState?.username ?? pendingUsername;
    if (authState?.authenticated && !username) {
      setUsernameInputOpen(true);
      return;
    }
    if (!username) return;
    void doPublish(username);
  };

  const handleSurfaceChange = useCallback((s: string) => {
    setSurface(s);
    lastUserEdit.current = Date.now();
    persistStyle({ surface: s });
  }, []);

  const handleVoiceChange = useCallback((v: string) => {
    setVoice(v);
    lastUserEdit.current = Date.now();
    persistStyle({ voice: v });
  }, []);

  const handleLightChange = useCallback((l: "day" | "night") => {
    setLight(l);
    lastUserEdit.current = Date.now();
    persistStyle({ light: l });
  }, []);

  const handleComboSelect = useCallback(async (s: string, v: string, l: string) => {
    setSurface(s);
    setVoice(v);
    setLight(l as "day" | "night");
    lastUserEdit.current = Date.now();
    await persistStyle({ surface: s, voice: v, light: l });
  }, []);

  const handleLayoutTemplateChange = useCallback(async (t: LayoutTemplateId) => {
    setLayoutTemplate(t);
    lastUserEdit.current = Date.now();
    const ok = await persistStyle({ layoutTemplate: t });
    if (ok) {
      lastUserEdit.current = 0;
      try {
        const res = await fetch(`/api/preview?username=draft&language=${language}`);
        if (res.ok) {
          const data = await res.json();
          if (data.config) {
            setConfig(data.config);
            if (data.config.layoutTemplate) setLayoutTemplate(data.config.layoutTemplate);
          }
        }
      } catch { /* ignore */ }
    }
  }, [language]);

  const fetchPreview = useCallback(async () => {
    try {
      const res = await fetch(`/api/preview?username=draft&language=${language}`);
      if (res.status === 401) {
        window.location.href = "/invite";
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);

        const userEditAge = Date.now() - lastUserEdit.current;
        if (userEditAge > POLL_INTERVAL) {
          if (data.config.surface) setSurface(data.config.surface);
          if (data.config.voice) setVoice(data.config.voice);
          if (data.config.light) setLight(data.config.light as "day" | "night");
          if (data.config.layoutTemplate) setLayoutTemplate(data.config.layoutTemplate);
        }
      }
      if (data.configHash) setConfigHash(data.configHash);
      if (data.publishStatus) {
        setPublishStatus(data.publishStatus);
      }
      if (data.config?.username) {
        setPublishUsername(data.config.username);
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [language]);

  // SSE preview with fallback to polling
  useEffect(() => {
    let es: EventSource | null = null;
    let errorCount = 0;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const startSSE = () => {
      es = new EventSource(`/api/preview/stream`);

      es.onmessage = (event) => {
        errorCount = 0;
        try {
          const data = JSON.parse(event.data);
          if (data.config) {
            setConfig(data.config);
            const userEditAge = Date.now() - lastUserEdit.current;
            if (userEditAge > POLL_INTERVAL) {
              if (data.config.surface) setSurface(data.config.surface);
              if (data.config.voice) setVoice(data.config.voice);
              if (data.config.light) setLight(data.config.light as "day" | "night");
              if (data.config.layoutTemplate) setLayoutTemplate(data.config.layoutTemplate);
            }
          }
          if (data.configHash) setConfigHash(data.configHash);
          if (data.publishStatus) setPublishStatus(data.publishStatus);
          if (data.config?.username) setPublishUsername(data.config.username);
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        errorCount++;
        if (errorCount >= 5) {
          es?.close();
          es = null;
          startPolling();
        }
      };
    };

    const startPolling = () => {
      fetchPreview();
      pollInterval = setInterval(fetchPreview, POLL_INTERVAL);
    };

    if (typeof EventSource !== "undefined") {
      startSSE();
    } else {
      startPolling();
    }

    return () => {
      es?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [fetchPreview]);

  const displayConfig: PageConfig | null = config
    ? {
        ...config,
        surface,
        voice,
        light,
        layoutTemplate,
      }
    : null;

  const handlePresenceClose = useCallback(() => setPresenceOpen(false), []);
  const handleAvatarChange = useCallback(() => { void fetchPreview(); }, [fetchPreview]);

  const presencePanel = (
    <PresencePanel
      open={presenceOpen}
      onClose={handlePresenceClose}
      config={config}
      surface={surface}
      voice={voice}
      light={light}
      layoutTemplate={layoutTemplate}
      onSurfaceChange={handleSurfaceChange}
      onVoiceChange={handleVoiceChange}
      onLightChange={handleLightChange}
      onComboSelect={handleComboSelect}
      onLayoutChange={handleLayoutTemplateChange}
      onAvatarChange={handleAvatarChange}
      language={language}
    />
  );

  const navBar = (
    <BuilderNavBar
      authState={authState}
      hasUnpublishedChanges={hasUnpublishedChanges}
      publishing={publishing}
      publishError={publishError}
      onPublish={handlePublish}
      onSignup={() => setSignupOpen(true)}
      onPresenceOpen={() => setPresenceOpen(true)}
    />
  );

  const usernameInput = usernameInputOpen && (
    <div className="flex items-center gap-3 border-b bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950">
      <span className="shrink-0 font-medium text-amber-800 dark:text-amber-200">
        Choose your username
      </span>
      <input
        type="text"
        value={pendingUsername}
        onChange={(e) => setPendingUsername(e.target.value.toLowerCase())}
        className="w-32 rounded border px-2 py-1 text-sm"
        placeholder="username"
      />
      <button
        onClick={() => {
          if (!pendingUsername) return;
          setUsernameInputOpen(false);
          void doPublish(pendingUsername);
        }}
        disabled={!pendingUsername || publishing}
        className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        Publish
      </button>
    </div>
  );

  const previewPane = displayConfig ? (
    <div className="relative h-full overflow-y-auto">
      {navBar}
      {usernameInput}
      <ProposalBanner />
      {/* Show PublishBar only when agent requested publish AND NavBar doesn't already show publish */}
      {publishStatus === "approval_pending" && !hasUnpublishedChanges && (
        <div className="flex items-center gap-3 border-b bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950">
          <span className="shrink-0 font-medium text-amber-800 dark:text-amber-200">
            Ready to publish
          </span>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {publishing ? "Publishing..." : "Publish"}
          </button>
        </div>
      )}
      <PageRenderer config={displayConfig} previewMode={true} />
      {presencePanel}
    </div>
  ) : (
    <div className="relative h-full overflow-y-auto">
      {navBar}
      <EmptyPreview language={language} />
      {presencePanel}
    </div>
  );

  return (
    <VoiceProvider language={language}>
      <>
        {/* Signup modal — rendered at top level */}
        <SignupModal
          open={signupOpen}
          onClose={() => setSignupOpen(false)}
          initialUsername={publishUsername !== "draft" ? publishUsername : deriveUsernameFromConfig(config)}
          language={language}
        />

        {/* Desktop: side-by-side */}
        <div className="hidden h-screen md:flex">
          <div className="w-[400px] shrink-0 overflow-hidden border-r">
            {chatDataReady && <ChatPanel language={language} authV2={authState?.authV2} authState={authState} onSignupRequest={() => { setPresenceOpen(false); setSignupOpen(true); }} initialBootstrap={bootstrapData} initialMessages={chatInitialMessages} disableInitialFetch={chatDataReady} isPrimaryVoiceConsumer={!isMobile} />}
          </div>
          <div className="relative flex-1">{previewPane}</div>
        </div>

        {/* Mobile: bottom tab bar */}
        <div className="flex h-dvh flex-col overflow-hidden md:hidden">
          {/* Content area */}
          <div className="flex-1 overflow-hidden relative">
            {/* Chat — always mounted, hidden when not active */}
            <div className={`absolute inset-0 flex flex-col ${activeMobileTab === "chat" ? "" : "hidden"}`}>
              {/* Unpublished changes banner — above ChatPanel so it doesn't overlap content */}
              {hasUnpublishedChanges && (
                <div style={{
                  flexShrink: 0,
                  background: "#c9a96e", color: "#111",
                  padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Changes ready to publish</span>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={publishing}
                    style={{
                      background: "rgba(0,0,0,0.15)", border: "none", color: "#111",
                      padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {publishing ? "Publishing\u2026" : "Publish \u2192"}
                  </button>
                </div>
              )}
              {chatDataReady && (
                <div className="flex-1 overflow-hidden">
                  <ChatPanel
                    language={language}
                    authV2={authState?.authV2}
                    authState={authState}
                    onSignupRequest={() => { setPresenceOpen(false); setSignupOpen(true); }}
                    initialBootstrap={bootstrapData}
                    initialMessages={chatInitialMessages}
                    disableInitialFetch={chatDataReady}
                    isPrimaryVoiceConsumer={isMobile}
                  />
                </div>
              )}
            </div>

            {/* Preview */}
            <div className={`absolute inset-0 overflow-y-auto ${activeMobileTab === "preview" ? "block" : "hidden"}`}>
              {previewPane}
              {voiceEnabled && <VoiceOverlay onOpenChat={() => setActiveMobileTab("chat")} />}
            </div>

            {/* Style (Presence panel as full-height sheet — inlineFullscreen on mobile) */}
            {activeMobileTab === "style" && (
              <div className="absolute inset-0 overflow-y-auto" style={{ background: "#0e0e10" }}>
                <PresencePanel
                  open={true}
                  onClose={() => setActiveMobileTab("chat")}
                  config={config}
                  surface={surface}
                  voice={voice}
                  light={light}
                  layoutTemplate={layoutTemplate}
                  onSurfaceChange={handleSurfaceChange}
                  onVoiceChange={handleVoiceChange}
                  onLightChange={handleLightChange}
                  onComboSelect={handleComboSelect}
                  onLayoutChange={handleLayoutTemplateChange}
                  onAvatarChange={handleAvatarChange}
                  language={language}
                  inlineFullscreen={true}
                />
              </div>
            )}
          </div>

          {/* Bottom tab bar — 56px */}
          <div style={{
            height: 56, flexShrink: 0,
            background: "#111113", borderTop: "1px solid rgba(255,255,255,0.07)",
            display: "flex",
          }}>
            {([
              { id: "chat", label: "Chat", icon: <ChatIcon /> },
              { id: "preview", label: "Preview", icon: <PreviewIcon /> },
              { id: "style", label: "Style", icon: <StyleIcon /> },
            ] as const).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveMobileTab(tab.id)}
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 4, border: "none", background: "none", cursor: "pointer",
                  fontFamily: "var(--font-jetbrains, monospace)", fontSize: 9, letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: activeMobileTab === tab.id ? "#c9a96e" : "rgba(255,255,255,0.35)",
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </>
    </VoiceProvider>
  );
}
