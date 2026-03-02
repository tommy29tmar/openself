"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PageConfig, StyleConfig } from "@/lib/page-config/schema";
import type { LanguageCode } from "@/lib/i18n/languages";
import type { AvailableFont } from "@/lib/page-config/fonts";
import type { LayoutTemplateId } from "@/lib/layout/contracts";
import type { AuthState } from "@/app/builder/page";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { SignupModal } from "@/components/auth/SignupModal";
import { BuilderNavBar } from "@/components/layout/BuilderNavBar";
import { ProposalBanner } from "@/components/builder/ProposalBanner";
import { PageRenderer } from "@/components/page";
import { getUiL10n } from "@/lib/i18n/ui-strings";
import { HERO_NAME_FALLBACKS } from "@/lib/i18n/hero-fallbacks";
import { friendlyError } from "@/lib/i18n/error-messages";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type SplitViewProps = {
  language: string;
  onLanguageChange?: (lang: LanguageCode) => void;
  initialConfig?: PageConfig | null;
  authState?: AuthState;
  publishedConfigHash?: string | null;
  onPublishedConfigHashChange?: (hash: string | null) => void;
};

const POLL_INTERVAL = 3000; // 3 seconds

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
  theme?: string;
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

function GearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border bg-background/80 shadow-sm backdrop-blur-sm transition-colors hover:bg-accent"
      aria-label="Open settings"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="text-muted-foreground"
      >
        <path
          d="M6.5 1.5h3l.4 1.8.7.3 1.6-.9 2.1 2.1-.9 1.6.3.7 1.8.4v3l-1.8.4-.3.7.9 1.6-2.1 2.1-1.6-.9-.7.3-.4 1.8h-3l-.4-1.8-.7-.3-1.6.9-2.1-2.1.9-1.6-.3-.7L.5 9.5v-3l1.8-.4.3-.7-.9-1.6 2.1-2.1 1.6.9.7-.3.4-1.8Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </button>
  );
}

export function SplitView({
  language,
  onLanguageChange,
  initialConfig,
  authState,
  publishedConfigHash,
  onPublishedConfigHashChange,
}: SplitViewProps) {
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
  const [theme, setTheme] = useState(config?.theme ?? "minimal");
  const [colorScheme, setColorScheme] = useState<StyleConfig["colorScheme"]>(
    config?.style?.colorScheme ?? "light",
  );
  const [fontFamily, setFontFamily] = useState<string>(
    config?.style?.fontFamily ?? "inter",
  );
  const [layoutTemplate, setLayoutTemplate] = useState<LayoutTemplateId>(
    (config?.layoutTemplate as LayoutTemplateId) ?? "monolith",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const handleThemeChange = useCallback((t: string) => {
    setTheme(t);
    lastUserEdit.current = Date.now();
    persistStyle({ theme: t });
  }, []);

  const handleColorSchemeChange = useCallback((cs: "light" | "dark") => {
    setColorScheme(cs);
    lastUserEdit.current = Date.now();
    persistStyle({ style: { colorScheme: cs } });
  }, []);

  const handleFontFamilyChange = useCallback((f: AvailableFont) => {
    setFontFamily(f);
    lastUserEdit.current = Date.now();
    persistStyle({ style: { fontFamily: f } });
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
          if (data.config.theme) setTheme(data.config.theme);
          if (data.config.style?.colorScheme) setColorScheme(data.config.style.colorScheme);
          if (data.config.style?.fontFamily) setFontFamily(data.config.style.fontFamily);
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
              if (data.config.theme) setTheme(data.config.theme);
              if (data.config.style?.colorScheme) setColorScheme(data.config.style.colorScheme);
              if (data.config.style?.fontFamily) setFontFamily(data.config.style.fontFamily);
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
        theme,
        layoutTemplate,
        style: { ...config.style, colorScheme, fontFamily },
      }
    : null;

  const settingsPanel = (
    <SettingsPanel
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      language={language}
      onLanguageChange={(lang) => {
        onLanguageChange?.(lang);
        setSettingsOpen(false);
      }}
      theme={theme}
      onThemeChange={handleThemeChange}
      colorScheme={colorScheme}
      onColorSchemeChange={handleColorSchemeChange}
      fontFamily={fontFamily}
      onFontFamilyChange={handleFontFamilyChange}
      layoutTemplate={layoutTemplate}
      onLayoutTemplateChange={handleLayoutTemplateChange}
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
      <GearButton onClick={() => setSettingsOpen(true)} />
      {settingsPanel}
    </div>
  ) : (
    <div className="relative h-full overflow-y-auto">
      {navBar}
      <EmptyPreview language={language} />
      <GearButton onClick={() => setSettingsOpen(true)} />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        language={language}
        onLanguageChange={(lang) => {
          onLanguageChange?.(lang);
          setSettingsOpen(false);
        }}
        languageOnly
        theme={theme}
        onThemeChange={handleThemeChange}
        colorScheme={colorScheme}
        onColorSchemeChange={handleColorSchemeChange}
        fontFamily={fontFamily}
        onFontFamilyChange={handleFontFamilyChange}
        layoutTemplate={layoutTemplate}
        onLayoutTemplateChange={handleLayoutTemplateChange}
      />
    </div>
  );

  return (
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
          {chatDataReady && <ChatPanel language={language} authV2={authState?.authV2} authState={authState} onSignupRequest={() => { setSettingsOpen(false); setSignupOpen(true); }} initialBootstrap={bootstrapData} initialMessages={chatInitialMessages} disableInitialFetch={chatDataReady} />}
        </div>
        <div className="relative flex-1">{previewPane}</div>
      </div>

      {/* Mobile: tabs */}
      <Tabs defaultValue="chat" className="flex h-screen flex-col md:hidden">
        <TabsList className="sticky top-0 z-40 w-full rounded-none">
          <TabsTrigger value="chat" className="flex-1">
            Chat
          </TabsTrigger>
          <TabsTrigger value="preview" className="flex-1">
            Preview
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="chat"
          forceMount
          className="flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          {chatDataReady && <ChatPanel language={language} authV2={authState?.authV2} authState={authState} onSignupRequest={() => { setSettingsOpen(false); setSignupOpen(true); }} initialBootstrap={bootstrapData} initialMessages={chatInitialMessages} disableInitialFetch={chatDataReady} />}
        </TabsContent>
        <TabsContent
          value="preview"
          forceMount
          className="relative flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          {previewPane}
        </TabsContent>
      </Tabs>
    </>
  );
}
