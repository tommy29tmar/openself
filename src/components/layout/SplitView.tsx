"use client";

import { useState, useEffect, useCallback } from "react";
import type { PageConfig, StyleConfig } from "@/lib/page-config/schema";
import type { LanguageCode } from "@/lib/i18n/languages";
import type { AvailableFont } from "@/lib/page-config/fonts";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { PageRenderer } from "@/components/page";
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
};

const POLL_INTERVAL = 3000; // 3 seconds

function EmptyPreview() {
  return (
    <div className="flex h-full items-center justify-center text-center">
      <div className="max-w-xs space-y-2">
        <p className="text-lg font-medium text-muted-foreground">
          Your page will appear here
        </p>
        <p className="text-sm text-muted-foreground">
          Start chatting and watch it build in real time
        </p>
      </div>
    </div>
  );
}

type PublishBarProps = {
  username: string;
};

function PublishBar({ username: initialUsername }: PublishBarProps) {
  const [username, setUsername] = useState(initialUsername);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (data.success) {
        setPublished(true);
      } else {
        setError(data.error || "Publish failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setPublishing(false);
    }
  };

  if (published) {
    return (
      <div className="flex items-center gap-3 border-b bg-green-50 px-4 py-3 text-sm dark:bg-green-950">
        <span className="font-medium text-green-800 dark:text-green-200">
          Published!
        </span>
        <a
          href={`/${username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-700 underline dark:text-green-300"
        >
          View at /{username}
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950">
      <span className="shrink-0 font-medium text-amber-800 dark:text-amber-200">
        Ready to publish
      </span>
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase())}
        className="w-32 rounded border px-2 py-1 text-sm"
        placeholder="username"
      />
      <button
        onClick={handlePublish}
        disabled={publishing || !username}
        className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {publishing ? "Publishing..." : "Publish"}
      </button>
      {error && (
        <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}

function persistStyle(patch: {
  theme?: string;
  style?: Partial<StyleConfig>;
}) {
  fetch("/api/draft/style", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {
    // fire-and-forget — errors are non-critical
  });
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

export function SplitView({ language, onLanguageChange, initialConfig }: SplitViewProps) {
  const [config, setConfig] = useState<PageConfig | null>(initialConfig ?? null);
  const [publishStatus, setPublishStatus] = useState<string>("draft");
  const [publishUsername, setPublishUsername] = useState<string>("");
  const [theme, setTheme] = useState(config?.theme ?? "minimal");
  const [colorScheme, setColorScheme] = useState<StyleConfig["colorScheme"]>(
    config?.style?.colorScheme ?? "light",
  );
  const [fontFamily, setFontFamily] = useState<string>(
    config?.style?.fontFamily ?? "inter",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleThemeChange = useCallback((t: string) => {
    setTheme(t);
    persistStyle({ theme: t });
  }, []);

  const handleColorSchemeChange = useCallback((cs: "light" | "dark") => {
    setColorScheme(cs);
    persistStyle({ style: { colorScheme: cs } });
  }, []);

  const handleFontFamilyChange = useCallback((f: AvailableFont) => {
    setFontFamily(f);
    persistStyle({ style: { fontFamily: f } });
  }, []);

  const fetchPreview = useCallback(async () => {
    try {
      const res = await fetch(`/api/preview?username=draft&language=${language}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
      }
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

  // Poll for preview updates
  useEffect(() => {
    fetchPreview(); // Initial fetch
    const interval = setInterval(fetchPreview, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchPreview]);

  const displayConfig: PageConfig | null = config
    ? {
        ...config,
        theme,
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
    />
  );

  const previewPane = displayConfig ? (
    <div className="relative h-full overflow-y-auto">
      {publishStatus === "approval_pending" && (
        <PublishBar username={publishUsername !== "draft" ? publishUsername : ""} />
      )}
      <PageRenderer config={displayConfig} />
      <GearButton onClick={() => setSettingsOpen(true)} />
      {settingsPanel}
    </div>
  ) : (
    <div className="relative h-full overflow-y-auto">
      <EmptyPreview />
      <GearButton onClick={() => setSettingsOpen(true)} />
      {settingsPanel}
    </div>
  );

  return (
    <>
      {/* Desktop: side-by-side */}
      <div className="hidden h-screen md:flex">
        <div className="w-[400px] shrink-0 border-r">
          <ChatPanel language={language} />
        </div>
        <div className="relative flex-1">{previewPane}</div>
      </div>

      {/* Mobile: tabs */}
      <Tabs defaultValue="chat" className="flex h-screen flex-col md:hidden">
        <TabsList className="w-full rounded-none">
          <TabsTrigger value="chat" className="flex-1">
            Chat
          </TabsTrigger>
          <TabsTrigger value="preview" className="flex-1">
            Preview
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex-1 overflow-hidden">
          <ChatPanel language={language} />
        </TabsContent>
        <TabsContent value="preview" className="relative flex-1 overflow-hidden">
          {previewPane}
        </TabsContent>
      </Tabs>
    </>
  );
}
