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

export function SplitView({ language, initialConfig }: SplitViewProps) {
  const [config, setConfig] = useState<PageConfig | null>(initialConfig ?? null);
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
        // Preserve user's theme/colorScheme overrides
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
