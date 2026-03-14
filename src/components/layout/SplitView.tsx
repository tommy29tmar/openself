"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PageConfig } from "@/lib/page-config/schema";
import type { LanguageCode } from "@/lib/i18n/languages";
import type { LayoutTemplateId } from "@/lib/layout/contracts";
import type { AuthState } from "@/app/builder/page";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { PresencePanel } from "@/components/presence/PresencePanel";
import { SignupModal } from "@/components/auth/SignupModal";
import { BuilderNavBar } from "@/components/layout/BuilderNavBar";
import { UnpublishedBanner } from "@/components/layout/UnpublishedBanner";
import { MobilePreviewHeader } from "@/components/layout/MobilePreviewHeader";
import { ProposalBanner } from "@/components/builder/ProposalBanner";
import { PageRenderer } from "@/components/page";
import type { SectionAction } from "@/components/page/SectionInteractionWrapper";
import { SectionActionSheet } from "@/components/page/SectionActionSheet";
import { SectionActionBar } from "@/components/page/SectionActionBar";
import { usePreviewInteraction } from "@/hooks/usePreviewInteraction";
import { getUiL10n } from "@/lib/i18n/ui-strings";
import { HERO_NAME_FALLBACKS } from "@/lib/i18n/hero-fallbacks";
import { friendlyError } from "@/lib/i18n/error-messages";
import { VoiceProvider } from "@/components/voice/VoiceProvider";
import { VoiceOverlay } from "@/components/voice/VoiceOverlay";
import { isVoiceEnabled } from "@/lib/voice/feature-flags";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ActivityDrawer } from "@/components/notifications/ActivityDrawer";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { usePreviewSync, POLL_INTERVAL } from "@/hooks/usePreviewSync";
import { useChatPrefetch } from "@/hooks/useChatPrefetch";
import { usePresenceHandlers } from "@/hooks/usePresenceHandlers";
import { useToastManager } from "@/hooks/useToastManager";
import { ToastContainer } from "@/components/ui/Toast";
import { getToolToastMessage } from "@/lib/i18n/tool-toast-messages";
import type { PageChange } from "@/lib/services/page-diff-service";

type SplitViewProps = {
  language: string;
  onLanguageChange?: (lang: LanguageCode) => void;
  initialConfig?: PageConfig | null;
  authState?: AuthState;
  publishedConfigHash?: string | null;
  onPublishedConfigHashChange?: (hash: string | null) => void;
  openSettings?: boolean;
};

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

function EmptyPreview({ language }: { language: string }) {
  const t = getUiL10n(language);
  return (
    <div className="flex h-full items-center justify-center text-center">
      <div className="max-w-xs space-y-2">
        <p className="text-lg font-medium text-muted-foreground">{t.pageWillAppear}</p>
        <p className="text-sm text-muted-foreground">{t.startChatting}</p>
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

  // Chat data prefetch
  const { bootstrapData, initialMessages: chatInitialMessages, ready: chatDataReady } = useChatPrefetch(language);

  // Page state
  const [config, setConfig] = useState<PageConfig | null>(initialConfig ?? null);
  const [configHash, setConfigHash] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<string>("draft");
  const [publishUsername, setPublishUsername] = useState<string>("");
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [surface, setSurface] = useState(config?.surface ?? "canvas");
  const [voice, setVoice] = useState(config?.voice ?? "signal");
  const [light, setLight] = useState<"day" | "night">((config?.light as "day" | "night") ?? "day");
  const [layoutTemplate, setLayoutTemplate] = useState<LayoutTemplateId>(
    (config?.layoutTemplate as LayoutTemplateId) ?? "monolith",
  );

  // UI state
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const { count: unreadCount, refresh: refreshUnread } = useUnreadCount();
  const [activeMobileTab, setActiveMobileTab] = useState<"chat" | "preview">("chat");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [usernameInputOpen, setUsernameInputOpen] = useState(false);
  const [pendingUsername, setPendingUsername] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const lastUserEdit = useRef(0);

  // Section interaction (canvas-style preview)
  const previewInteraction = usePreviewInteraction();
  const [pendingAction, setPendingAction] = useState<SectionAction | null>(null);
  const [hasSeenHint, setHasSeenHint] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("openself:longpress-hint-seen") === "1";
  });
  const chatInputRef = useRef<HTMLInputElement>(null);

  const dismissHint = useCallback(() => {
    setHasSeenHint(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("openself:longpress-hint-seen", "1");
    }
  }, []);

  // Detect keyboard open via visualViewport
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const handler = () => setKeyboardOpen(vv.height < window.innerHeight - 150);
    vv.addEventListener("resize", handler);
    return () => vv.removeEventListener("resize", handler);
  }, []);

  // Auto-open presence when returning from OAuth connector flow
  useEffect(() => {
    if (openSettings) setPresenceOpen(true);
  }, [openSettings]);

  // Toast manager
  const toastManager = useToastManager();
  const handleToolComplete = useCallback((toolName: string) => {
    const msg = getToolToastMessage(toolName, language);
    if (msg) toastManager.add(msg, "success");
  }, [language, toastManager]);

  const hasUnpublishedChanges = Boolean(
    configHash && (
      (publishedConfigHash && configHash !== publishedConfigHash) ||
      (!publishedConfigHash && config)
    )
  );

  // Diff changes for unpublished banner
  const [pageChanges, setPageChanges] = useState<PageChange[]>([]);
  useEffect(() => {
    if (!hasUnpublishedChanges || !publishedConfigHash) {
      setPageChanges([]);
      return;
    }
    let cancelled = false;
    fetch("/api/draft/diff", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success && Array.isArray(data.changes)) {
          setPageChanges(data.changes);
        }
      })
      .catch(() => {
        // Diff fetch failure is non-critical
      });
    return () => { cancelled = true; };
  }, [hasUnpublishedChanges, configHash, publishedConfigHash]);

  // Discard draft changes
  const handleDiscardDraft = useCallback(async () => {
    const res = await fetch("/api/draft/discard", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      onPublishedConfigHashChange?.(configHash);
      setPageChanges([]);
    }
  }, [configHash, onPublishedConfigHashChange]);

  const t = getUiL10n(language);
  const authenticated = authState?.authenticated ?? false;

  // Presence style handlers
  const {
    handleSurfaceChange, handleVoiceChange, handleLightChange,
    handleComboSelect, handleLayoutTemplateChange, fetchPreview,
  } = usePresenceHandlers({
    setSurface, setVoice, setLight, setLayoutTemplate, setConfig,
    lastUserEdit, language,
  });

  // SSE preview with polling fallback
  usePreviewSync({
    enabled: true,
    language,
    onUpdate: (data) => {
      if (Date.now() - lastUserEdit.current < POLL_INTERVAL) {
        if (data.config) setConfig(data.config);
        if (data.configHash) setConfigHash(data.configHash);
        if (data.publishStatus) setPublishStatus(data.publishStatus);
        if (data.username) setPublishUsername(data.username);
        if (data.hiddenSections) setHiddenSections(data.hiddenSections);
        return;
      }
      if (data.config) setConfig(data.config);
      if (data.configHash) setConfigHash(data.configHash);
      if (data.publishStatus) setPublishStatus(data.publishStatus);
      if (data.username) setPublishUsername(data.username);
      if (data.surface) setSurface(data.surface);
      if (data.voice) setVoice(data.voice);
      if (data.light) setLight(data.light as "day" | "night");
      if (data.layoutTemplate) setLayoutTemplate(data.layoutTemplate as LayoutTemplateId);
      if (data.hiddenSections) setHiddenSections(data.hiddenSections);
    },
  });

  const displayConfig: PageConfig | null = config
    ? { ...config, surface, voice, light, layoutTemplate }
    : null;

  // Callbacks
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } catch { setLoggingOut(false); }
  };

  const doPublish = async (username: string) => {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, expectedHash: configHash }),
      });
      if (res.status === 401) { window.location.href = "/invite"; return; }
      const data = await res.json();
      if (data.success) {
        onPublishedConfigHashChange?.(configHash);
        window.location.href = data.url;
      } else {
        setPublishError(friendlyError(data.code, t));
      }
    } catch { setPublishError(t.networkError); }
    finally { setPublishing(false); }
  };

  const handlePublish = () => {
    const username = authState?.username ?? pendingUsername;
    if (authState?.authenticated && !username) { setUsernameInputOpen(true); return; }
    if (!username) { setSignupOpen(true); return; }
    void doPublish(username);
  };

  const handlePresenceClose = useCallback(() => setPresenceOpen(false), []);
  const handleAvatarChange = useCallback(() => { void fetchPreview(); }, [fetchPreview]);
  const handleActivityToggle = useCallback(() => {
    setActivityOpen(prev => {
      if (!prev) setPresenceOpen(false);
      return !prev;
    });
  }, []);

  // Execute a section action directly (from bottom sheet or desktop inline).
  // Uses refs for values that change frequently to keep the callback stable.
  const displayConfigRef = useRef(displayConfig);
  displayConfigRef.current = displayConfig;

  const handleSectionActionDirect = useCallback((action: SectionAction) => {
    if (action.type === "edit") {
      previewInteraction.injectSectionContext(action, displayConfigRef.current);
      if (isMobile) {
        // Switch to chat tab, then focus input after tab switch
        setActiveMobileTab("chat");
        setTimeout(() => chatInputRef.current?.focus(), 50);
      }
    } else if (action.type === "hide") {
      void fetch("/api/draft/toggle-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionType: action.sectionType, hidden: true }),
      });
    } else if (action.type === "show") {
      void fetch("/api/draft/toggle-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionType: action.sectionType, hidden: false }),
      });
    } else if (action.type === "moveUp" || action.type === "moveDown") {
      void fetch("/api/draft/reorder-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionType: action.sectionType, direction: action.type === "moveUp" ? "up" : "down" }),
      });
    }
  }, [previewInteraction, isMobile]);

  // Section action handler — mobile opens bottom sheet, desktop handles inline
  const handleSectionAction = useCallback((action: SectionAction) => {
    if (isMobile) {
      // On mobile, long-press always opens the action sheet
      setPendingAction(action);
      setPresenceOpen(false);
      setActivityOpen(false);
    } else {
      // Desktop: handle directly (action bar buttons fire specific types)
      handleSectionActionDirect(action);
    }
  }, [isMobile, handleSectionActionDirect]);

  // Desktop action bar factory
  const renderActionBar = useCallback((props: { sectionType: string; sectionIndex: number; totalSections: number }) => (
    <SectionActionBar
      sectionType={props.sectionType}
      sectionIndex={props.sectionIndex}
      totalSections={props.totalSections}
      onAction={handleSectionAction}
    />
  ), [handleSectionAction]);

  const heroName = config?.sections?.find((s) => s.type === "hero")?.content?.name as string | undefined;

  // Shared presence panel props
  const presenceProps = {
    config, surface, voice, light, layoutTemplate,
    onSurfaceChange: handleSurfaceChange,
    onVoiceChange: handleVoiceChange,
    onLightChange: handleLightChange,
    onComboSelect: handleComboSelect,
    onLayoutChange: handleLayoutTemplateChange,
    onAvatarChange: handleAvatarChange,
    language,
    onClose: handlePresenceClose,
  };

  const chatPanelProps = (isPrimary: boolean) => ({
    language,
    authV2: authState?.authV2,
    authState,
    onSignupRequest: () => { setPresenceOpen(false); setSignupOpen(true); },
    initialBootstrap: bootstrapData,
    initialMessages: chatInitialMessages,
    disableInitialFetch: chatDataReady,
    isPrimaryVoiceConsumer: isPrimary,
    onToolComplete: handleToolComplete,
    sectionContext: previewInteraction.pendingContext,
    onSectionContextConsumed: previewInteraction.consumeContext,
  });

  const usernameInput = usernameInputOpen && (
    <div className="flex items-center gap-3 border-b bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950">
      <span className="shrink-0 font-medium text-amber-800 dark:text-amber-200">Choose your username</span>
      <input
        type="text"
        value={pendingUsername}
        onChange={(e) => setPendingUsername(e.target.value.toLowerCase())}
        className="w-32 rounded border px-2 py-1 text-sm"
        placeholder="username"
      />
      <button
        type="button"
        onClick={() => { if (!pendingUsername) return; setUsernameInputOpen(false); void doPublish(pendingUsername); }}
        disabled={!pendingUsername || publishing}
        className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >Publish</button>
    </div>
  );

  const previewContent = displayConfig ? (
    <>
      {usernameInput}
      <ProposalBanner />
      {authenticated && authState?.emailVerified === false && (
        <div className="flex items-center gap-3 border-b bg-blue-50 px-4 py-2 text-sm dark:bg-blue-950">
          <span className="text-blue-800 dark:text-blue-200">
            Verify your email to publish your page.
          </span>
          <a
            href="/api/auth/resend-verification"
            onClick={async (e) => {
              e.preventDefault();
              try {
                await fetch("/api/auth/resend-verification", { method: "POST" });
              } catch { /* silent */ }
            }}
            className="shrink-0 text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
          >
            Resend email
          </a>
        </div>
      )}
      <UnpublishedBanner
        hasUnpublishedChanges={hasUnpublishedChanges}
        publishing={publishing}
        publishStatus={publishStatus}
        authenticated={authenticated}
        onPublish={handlePublish}
        unpublishedChangesLabel={t.unpublishedChanges}
        publishLabel={t.publish}
        changes={pageChanges}
        language={language}
        onDiscard={publishedConfigHash ? handleDiscardDraft : undefined}
      />
      <PageRenderer
        config={displayConfig}
        previewMode={true}
        hiddenSections={hiddenSections}
        onSectionAction={handleSectionAction}
        renderActionBar={renderActionBar}
      />
    </>
  ) : (
    <EmptyPreview language={language} />
  );

  return (
    <VoiceProvider language={language}>
      <>
        <SignupModal
          open={signupOpen}
          onClose={() => setSignupOpen(false)}
          initialUsername={publishUsername !== "draft" ? publishUsername : deriveUsernameFromConfig(config)}
          language={language}
        />

        {/* Desktop */}
        <div className="hidden h-screen md:flex flex-col">
          <BuilderNavBar
            authState={authState}
            hasUnpublishedChanges={hasUnpublishedChanges}
            publishing={publishing}
            publishError={publishError}
            onPublish={handlePublish}
            onSignup={() => setSignupOpen(true)}
            onPresenceOpen={() => { setActivityOpen(false); setPresenceOpen(true); }}
            pageName={heroName}
            publishedUsername={authState?.publishedUsername ?? null}
            unreadCount={unreadCount}
            onActivityOpen={handleActivityToggle}
            bellRef={bellRef}
          />
          <div className="flex flex-1 min-h-0">
            <div style={{ width: 400, flexShrink: 0, background: "#0d0d0f", borderRight: "1px solid rgba(255,255,255,0.06)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {chatDataReady && <ChatPanel {...chatPanelProps(!isMobile)} />}
            </div>
            <div style={{ flex: 1, background: "#1a1a1e", overflowY: "auto" }}>
              {previewContent}
            </div>
          </div>
          {!isMobile && presenceOpen && (
            <PresencePanel {...presenceProps} open={presenceOpen} inlineFullscreen={false} showMiniPreview={false} />
          )}
          <ActivityDrawer open={activityOpen} onClose={() => setActivityOpen(false)} language={language} t={t} isMobile={false} onUnreadRefresh={refreshUnread} bellRef={bellRef} />
        </div>

        {/* Mobile */}
        <div className="flex h-dvh flex-col overflow-hidden md:hidden" style={{ background: "#0d0d0f" }}>
          <div className="flex-1 overflow-hidden relative">
            {/* Chat tab */}
            <div className={`absolute inset-0 flex flex-col ${activeMobileTab === "chat" ? "" : "hidden"}`}>
              {!keyboardOpen && (
                <div style={{ textAlign: "center", padding: "12px 0 8px", fontSize: 12, fontFamily: "monospace", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)", background: "#0d0d0f", flexShrink: 0 }}>
                  {heroName ? `${heroName}'s page` : "My page"} &middot; Draft
                </div>
              )}
              {!chatDataReady && (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading&hellip;</div>
              )}
              {chatDataReady && (
                <div className="flex-1 overflow-hidden">
                  <ChatPanel {...chatPanelProps(isMobile)} />
                </div>
              )}
            </div>
            {/* Preview tab */}
            <div className={`absolute inset-0 overflow-y-auto ${activeMobileTab === "preview" ? "block" : "hidden"}`}>
              <MobilePreviewHeader
                hasUnpublishedChanges={hasUnpublishedChanges}
                publishing={publishing}
                authenticated={authenticated}
                publishError={publishError}
                loggingOut={loggingOut}
                onPublish={handlePublish}
                onSignup={() => setSignupOpen(true)}
                onPresenceOpen={() => { setActivityOpen(false); setPresenceOpen(true); }}
                onLogout={handleLogout}
              />
              {previewContent}
              {/* Long-press hint for first-time mobile users */}
              {!hasSeenHint && displayConfig && (
                <div className="mx-4 mb-4 rounded-xl bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
                  {t.longPressHint}
                  <button type="button" onClick={dismissHint} className="ml-2 underline">
                    {t.dismiss}
                  </button>
                </div>
              )}
            </div>
          </div>

          {voiceEnabled && activeMobileTab === "preview" && <VoiceOverlay />}

          {/* Bottom tab bar */}
          <div style={{ height: keyboardOpen ? 0 : 56, flexShrink: 0, overflow: "hidden", background: "#111113", borderTop: keyboardOpen ? "none" : "1px solid rgba(255,255,255,0.07)", display: "flex" }}>
            {([
              { id: "chat", label: "Chat", icon: <ChatIcon /> },
              { id: "preview", label: "Preview", icon: <PreviewIcon /> },
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

          {isMobile && presenceOpen && (
            <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#0e0e10", overflowY: "auto" }}>
              <PresencePanel {...presenceProps} open={true} inlineFullscreen={true} showMiniPreview={true} miniPreviewConfig={displayConfig} />
            </div>
          )}
          <ActivityDrawer open={activityOpen} onClose={() => setActivityOpen(false)} language={language} t={t} isMobile={true} onUnreadRefresh={refreshUnread} bellRef={bellRef} />
        </div>

        {/* Mobile section action sheet */}
        {pendingAction && (
          <SectionActionSheet
            open={true}
            onClose={() => setPendingAction(null)}
            sectionType={pendingAction.sectionType}
            sectionIndex={pendingAction.sectionIndex}
            totalSections={displayConfig?.sections?.length ?? 0}
            isHidden={hiddenSections.includes(pendingAction.sectionType)}
            onAction={(a) => {
              setPendingAction(null);
              handleSectionActionDirect(a);
            }}
            t={t}
          />
        )}

        <ToastContainer
          toasts={toastManager.toasts}
          onDismiss={toastManager.dismiss}
          mobile={isMobile}
          tabBarVisible={!keyboardOpen}
        />
      </>
    </VoiceProvider>
  );
}
