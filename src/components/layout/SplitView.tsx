"use client";

import { useState, useEffect, useCallback } from "react";
import type { PageConfig, StyleConfig } from "@/lib/page-config/schema";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { PageRenderer } from "@/components/page";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type SplitViewProps = {
  language: string;
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

export function SplitView({ language, initialConfig }: SplitViewProps) {
  const [config, setConfig] = useState<PageConfig | null>(initialConfig ?? null);
  const [publishStatus, setPublishStatus] = useState<string>("draft");
  const [publishUsername, setPublishUsername] = useState<string>("");
  const [theme, setTheme] = useState(config?.theme ?? "minimal");
  const [colorScheme, setColorScheme] = useState<StyleConfig["colorScheme"]>(
    config?.style?.colorScheme ?? "light",
  );

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
        style: { ...config.style, colorScheme },
      }
    : null;

  const previewPane = displayConfig ? (
    <div className="relative h-full overflow-y-auto">
      {publishStatus === "approval_pending" && (
        <PublishBar username={publishUsername !== "draft" ? publishUsername : ""} />
      )}
      <PageRenderer config={displayConfig} />
      <ThemeToggle
        theme={theme}
        colorScheme={colorScheme}
        onThemeChange={setTheme}
        onColorSchemeChange={setColorScheme}
      />
    </div>
  ) : (
    <div className="relative h-full overflow-y-auto">
      <EmptyPreview />
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
