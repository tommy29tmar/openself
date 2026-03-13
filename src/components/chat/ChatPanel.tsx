"use client";

import { useChat } from "ai/react";
import { useRef, useEffect, useState, useCallback, type FormEvent, type ChangeEvent } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ChatInput } from "@/components/chat/ChatInput";
import type { AuthState } from "@/app/builder/page";
import { getUiL10n } from "@/lib/i18n/ui-strings";
import { friendlyError, chatFriendlyError, parseChatErrorJson } from "@/lib/i18n/error-messages";
import { useVoice } from "@/components/voice/VoiceProvider";

const LIMIT_MESSAGES: Record<string, string> = {
  en: "You\u2019ve used all your messages. Pick a username to publish your page!",
  it: "Hai esaurito i messaggi. Scegli un username per pubblicare la tua pagina!",
  de: "Du hast alle Nachrichten verbraucht. W\u00e4hle einen Benutzernamen, um deine Seite zu ver\u00f6ffentlichen!",
  fr: "Tu as utilis\u00e9 tous tes messages. Choisis un nom d\u2019utilisateur pour publier ta page\u00a0!",
  es: "\u00a1Has usado todos tus mensajes! Elige un nombre de usuario para publicar tu p\u00e1gina.",
  pt: "Usaste todas as tuas mensagens. Escolhe um nome de utilizador para publicar a tua p\u00e1gina!",
  ja: "\u30e1\u30c3\u30bb\u30fc\u30b8\u3092\u3059\u3079\u3066\u4f7f\u3044\u307e\u3057\u305f\u3002\u30e6\u30fc\u30b6\u30fc\u540d\u3092\u9078\u3093\u3067\u30da\u30fc\u30b8\u3092\u516c\u958b\u3057\u307e\u3057\u3087\u3046\uff01",
  zh: "\u4f60\u5df2\u7528\u5b8c\u6240\u6709\u6d88\u606f\u3002\u9009\u62e9\u4e00\u4e2a\u7528\u6237\u540d\u6765\u53d1\u5e03\u4f60\u7684\u9875\u9762\uff01",
};

type BootstrapResponse = {
  journeyState?: string;
  userName?: string | null;
  publishedUsername?: string | null;
  language?: string;
  greeting?: string;
  isActiveSession?: boolean;
};

const LIMIT_AUTHENTICATED_MESSAGES: Record<string, string> = {
  en: "You've reached the message limit.",
  it: "Hai raggiunto il limite di messaggi.",
  de: "Du hast das Nachrichtenlimit erreicht.",
  fr: "Tu as atteint la limite de messages.",
  es: "Has alcanzado el límite de mensajes.",
  pt: "Atingiste o limite de mensagens.",
  ja: "メッセージの上限に達しました。",
  zh: "你已达到消息上限。",
};

const LIMIT_PUBLISH_CTA: Record<string, string> = {
  en: "Your page is ready! Publish as",
  it: "La tua pagina è pronta! Pubblica come",
  de: "Deine Seite ist bereit! Veröffentliche als",
  fr: "Ta page est prête ! Publie en tant que",
  es: "¡Tu página está lista! Publica como",
  pt: "A tua página está pronta! Publica como",
  ja: "ページの準備ができました！公開：",
  zh: "你的页面已准备好！发布为",
};

type LimitReachedUIProps = {
  language: string;
  authState?: AuthState;
  onSignupRequest?: () => void;
  requestingPublish: boolean;
  publishRequested: boolean;
  publishRequestError: string | null;
  handleRequestPublish: (username?: string) => void;
  oauthUsername: string;
  setOauthUsername: (v: string) => void;
};

function LimitReachedUI({
  language,
  authState,
  onSignupRequest,
  requestingPublish,
  publishRequested,
  publishRequestError,
  handleRequestPublish,
  oauthUsername,
  setOauthUsername,
}: LimitReachedUIProps) {
  const t = getUiL10n(language);
  // Case 1: Authenticated with published page — show limit + link
  if (authState?.authenticated && authState?.publishedUsername) {
    return (
      <div className="border-t bg-amber-50 px-4 py-3 dark:bg-amber-950">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          {LIMIT_AUTHENTICATED_MESSAGES[language] ?? LIMIT_AUTHENTICATED_MESSAGES.en}
        </p>
        <a
          href={`/${authState.publishedUsername}`}
          className="mt-1 inline-block text-sm font-medium text-amber-700 underline dark:text-amber-300"
        >
          {language === "it" ? "Vai alla tua pagina" : "Go to your page"} →
        </a>
      </div>
    );
  }

  // Case 2: Authenticated with username but no published page — CTA to publish
  if (authState?.authenticated && authState?.username) {
    if (publishRequested) {
      return (
        <div className="border-t bg-green-50 px-4 py-3 dark:bg-green-950">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            {language === "it"
              ? "Pubblicazione richiesta! Conferma nel pannello anteprima."
              : "Publish requested! Confirm in the preview panel."}
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-2 border-t bg-amber-50 px-4 py-3 dark:bg-amber-950">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          {LIMIT_PUBLISH_CTA[language] ?? LIMIT_PUBLISH_CTA.en}{" "}
          <span className="font-semibold">{authState.username}</span>
        </p>
        <button
          onClick={() => handleRequestPublish()}
          disabled={requestingPublish}
          className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {requestingPublish
            ? "..."
            : language === "it"
              ? "Pubblica"
              : "Publish"}
        </button>
        {publishRequestError && (
          <p className="text-sm text-red-600 dark:text-red-400">{publishRequestError}</p>
        )}
      </div>
    );
  }

  // Case 3: Authenticated but no username (OAuth edge case) — username input + publish
  if (authState?.authenticated && !authState?.username) {
    if (publishRequested) {
      return (
        <div className="border-t bg-green-50 px-4 py-3 dark:bg-green-950">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            {language === "it"
              ? "Pubblicazione richiesta! Conferma nel pannello anteprima."
              : "Publish requested! Confirm in the preview panel."}
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-2 border-t bg-amber-50 px-4 py-3 dark:bg-amber-950">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          {LIMIT_AUTHENTICATED_MESSAGES[language] ?? LIMIT_AUTHENTICATED_MESSAGES.en}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={oauthUsername}
            onChange={(e) => setOauthUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="username"
            className="w-32 rounded border bg-background px-2 py-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && oauthUsername.trim()) handleRequestPublish(oauthUsername.trim());
            }}
          />
          <button
            onClick={() => handleRequestPublish(oauthUsername.trim())}
            disabled={requestingPublish || !oauthUsername.trim()}
            className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {requestingPublish
              ? "..."
              : language === "it"
                ? "Pubblica"
                : "Publish"}
          </button>
        </div>
        {publishRequestError && (
          <p className="text-sm text-red-600 dark:text-red-400">{publishRequestError}</p>
        )}
      </div>
    );
  }

  // Case 4: Not authenticated — prompt to open signup modal
  return (
    <div className="space-y-2 border-t bg-amber-50 px-4 py-3 dark:bg-amber-950">
      <p className="text-sm text-amber-800 dark:text-amber-200">
        {LIMIT_MESSAGES[language] ?? LIMIT_MESSAGES.en}
      </p>
      <button
        onClick={() => onSignupRequest?.()}
        disabled={!onSignupRequest}
        className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {t.signupToContinue}
      </button>
    </div>
  );
}

type ChatPanelProps = {
  language?: string;
  /** When true, show email + password fields in the signup form */
  authV2?: boolean;
  authState?: AuthState;
  onSignupRequest?: () => void;
  initialBootstrap?: Record<string, unknown> | null;
  initialMessages?: Array<{id: string; role: string; content: string}>;
  disableInitialFetch?: boolean;
  isPrimaryVoiceConsumer?: boolean;
};

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type MessagesResponse = {
  success?: boolean;
  messages?: Array<{
    id?: string;
    role?: string;
    content?: string;
  }>;
};

type ChatPanelInnerProps = {
  language: string;
  authV2: boolean;
  initialMessages: StoredMessage[];
  authState?: AuthState;
  onSignupRequest?: () => void;
  isPrimaryVoiceConsumer?: boolean;
  pendingGreeting?: { id: string; content: string } | null;
};

function ChatPanelLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
        Loading chat history...
      </div>
    </div>
  );
}

export function ChatPanel({ language = "en", authV2 = true, authState, onSignupRequest, initialBootstrap, initialMessages: propMessages, disableInitialFetch, isPrimaryVoiceConsumer }: ChatPanelProps) {
  const [initialMessages, setInitialMessages] = useState<StoredMessage[]>([]);
  const greetingRef = useRef<{ id: string; content: string } | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    if (disableInitialFetch) {
      const bootstrap = initialBootstrap as BootstrapResponse | null;
      const greetingText = bootstrap?.greeting;
      const isActive = bootstrap?.isActiveSession ?? false;

      const restoredMessages: StoredMessage[] = (propMessages ?? [])
        .filter((m): m is {id: string; role: string; content: string} =>
          (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ id: m.id, role: m.role as StoredMessage["role"], content: m.content }));

      if (isActive && restoredMessages.length > 0) {
        setInitialMessages(restoredMessages);
      } else {
        const greeting: StoredMessage = {
          id: `greeting-${Date.now()}`,
          role: "assistant",
          content: greetingText || "Hey! What would you like to work on?",
        };
        setInitialMessages([greeting]);
        greetingRef.current = { id: greeting.id, content: greeting.content };
      }
      setHistoryLoaded(true);
      return;
    }

    let cancelled = false;
    const load = async () => {
      let bootstrap: BootstrapResponse | null = null;
      let historyMessages: StoredMessage[] = [];

      try {
        const [bootstrapRes, messagesRes] = await Promise.all([
          fetch(`/api/chat/bootstrap?language=${language}`, { cache: "no-store" }),
          fetch("/api/messages", { cache: "no-store" }),
        ]);
        if (bootstrapRes.ok) bootstrap = await bootstrapRes.json();
        if (messagesRes.status === 401) {
          window.location.href = "/invite";
          return;
        }
        if (messagesRes.ok) {
          const data = await messagesRes.json() as MessagesResponse;
          if (data.success && Array.isArray(data.messages)) {
            historyMessages = data.messages
              .filter((m): m is { id: string; role: string; content: string } =>
                typeof m.id === "string" && typeof m.role === "string" && typeof m.content === "string")
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({ id: m.id, role: m.role as StoredMessage["role"], content: m.content }));
          }
        }
      } catch {
        // Fetch failed — use fallback
      }

      if (cancelled) return;

      const isActive = bootstrap?.isActiveSession ?? false;
      const greetingText = bootstrap?.greeting;

      if (isActive && historyMessages.length > 0) {
        setInitialMessages(historyMessages);
      } else {
        const greeting: StoredMessage = {
          id: `greeting-${Date.now()}`,
          role: "assistant",
          content: greetingText || "Hey! What would you like to work on?",
        };
        setInitialMessages([greeting]);
        greetingRef.current = { id: greeting.id, content: greeting.content };
      }
      setHistoryLoaded(true);
    };

    load();
    return () => { cancelled = true; };
  }, [language, disableInitialFetch, initialBootstrap, propMessages]);

  if (!historyLoaded) {
    return <ChatPanelLoading />;
  }

  return (
    <ChatPanelInner
      key={language}
      language={language}
      authV2={authV2}
      initialMessages={initialMessages}
      authState={authState}
      onSignupRequest={onSignupRequest}
      isPrimaryVoiceConsumer={isPrimaryVoiceConsumer}
      pendingGreeting={greetingRef.current}
    />
  );
}

function ChatPanelInner({
  language,
  authV2,
  initialMessages,
  authState,
  onSignupRequest,
  isPrimaryVoiceConsumer,
  pendingGreeting,
}: ChatPanelInnerProps) {
  const t = getUiL10n(language);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [requestingPublish, setRequestingPublish] = useState(false);
  const [publishRequested, setPublishRequested] = useState(false);
  const [publishRequestError, setPublishRequestError] = useState<string | null>(null);
  // Username for OAuth edge case (authenticated but no username)
  const [oauthUsername, setOauthUsername] = useState("");

  // Ref for refreshChat to avoid forward-reference in onFinish closure
  const refreshChatRef = useRef<() => Promise<boolean>>(async () => false);

  // Refs for voice (needed in onFinish closure, which is defined before voice context is available)
  const voiceRef = useRef(false);
  const isPrimaryRef = useRef(false);
  const voiceSpeakRef = useRef<(text: string) => void>(() => {});

  const pendingGreetingRef = useRef(pendingGreeting);

  const { messages, input, handleInputChange, handleSubmit, isLoading, reload, setMessages, append, error: streamError } =
    useChat({
      api: "/api/chat",
      body: {
        language,
        ...(pendingGreetingRef.current ? { greetingMessage: pendingGreetingRef.current } : {}),
      },
      initialMessages,
      onResponse: (response) => {
        if (response.status === 401) {
          window.location.href = "/invite";
          return;
        }

        // Check for message limit headers
        const count = response.headers.get("X-Message-Count");
        const limit = response.headers.get("X-Message-Limit");
        if (count && limit && parseInt(count) >= parseInt(limit)) {
          setLimitReached(true);
        }
        setChatError(null);

        // After first message sent, clear the pending greeting
        pendingGreetingRef.current = null;
      },
      onError: (error) => {
        // Check if it's a 429 with limit info
        if (error.message?.includes("Message limit reached")) {
          setLimitReached(true);
          return;
        }

        if (error.message && /unauthorized/i.test(error.message)) {
          window.location.href = "/invite";
          return;
        }

        // Try to parse structured JSON from server (bypass extractErrorMessage which strips code/requestId)
        const parsed = parseChatErrorJson(error.message ?? "");
        setChatError(chatFriendlyError(parsed?.code ?? null, language, parsed?.requestId));
      },
      onFinish: (message) => {
        // Step exhaustion recovery: if the final assistant message has no text,
        // refresh from DB where the server saved a synthetic message
        if (!message.content?.trim()) {
          let attempts = 0;
          const tryRefresh = async () => {
            const hasContent = await refreshChatRef.current();
            attempts++;
            if (!hasContent && attempts < 3) {
              setTimeout(tryRefresh, 500);
            }
          };
          tryRefresh();
        }
        // TTS in voice mode (guarded via refs to avoid stale closures)
        if (isPrimaryRef.current && voiceRef.current && message.content?.trim()) {
          voiceSpeakRef.current(message.content);
        }
      },
    });

  // Defense-in-depth: onError handles all error paths today, but useChat's error
  // state is the canonical source. This guard ensures display if SDK behavior changes.
  useEffect(() => {
    if (!streamError) return;
    const parsed = parseChatErrorJson(streamError.message ?? "");
    setChatError(chatFriendlyError(parsed?.code ?? null, language, parsed?.requestId));
  }, [streamError, language]);

  // Re-sync messages from the server DB to recover from stream errors.
  // Returns true if the last assistant message has non-empty content.
  const refreshChat = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/messages", { cache: "no-store" });
      if (!res.ok) return false;
      const data = (await res.json()) as MessagesResponse;
      if (!data.success || !Array.isArray(data.messages)) return false;
      const restored: StoredMessage[] = data.messages
        .filter(
          (m): m is { id: string; role: string; content: string } =>
            typeof m.id === "string" &&
            typeof m.role === "string" &&
            typeof m.content === "string",
        )
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as StoredMessage["role"],
          content: m.content,
        }));
      if (restored.length === 0) {
        // Session expired during recovery — fetch fresh greeting from bootstrap
        try {
          const bRes = await fetch(`/api/chat/bootstrap?language=${language}`, { cache: "no-store" });
          if (bRes.ok) {
            const boot = await bRes.json();
            if (boot.greeting) {
              const greetingMsg = { id: `greeting-${Date.now()}`, role: "assistant" as const, content: boot.greeting };
              setMessages([greetingMsg]);
              // Track for lazy persistence so the greeting gets persisted on next user message
              pendingGreetingRef.current = { id: greetingMsg.id, content: greetingMsg.content };
              setChatError(null);
              return true;
            }
          }
        } catch { /* fall through */ }
        return false;
      }
      setMessages(restored);
      setChatError(null);
      const lastAssistant = [...restored].reverse().find(m => m.role === "assistant");
      return !!(lastAssistant?.content?.trim());
    } catch {
      return false;
    }
  }, [language, setMessages]);

  // Keep ref in sync for onFinish closure
  refreshChatRef.current = refreshChat;

  // Voice context — sync refs for onFinish closure
  const voice = useVoice();
  const { lastFinalTranscript, consumeTranscript, disableVoiceMode } = voice;
  voiceRef.current = voice.voiceMode;
  isPrimaryRef.current = isPrimaryVoiceConsumer ?? false;
  voiceSpeakRef.current = voice.speakResponse;

  // Transcript consumption (guarded by isPrimaryVoiceConsumer)
  useEffect(() => {
    if (!isPrimaryVoiceConsumer) return;
    if (lastFinalTranscript) {
      append({ role: "user", content: lastFinalTranscript }, { body: { language } });
      consumeTranscript();
    }
  }, [lastFinalTranscript, isPrimaryVoiceConsumer, append, language, consumeTranscript]);

  // Typing disables voice mode
  const handleTyping = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    disableVoiceMode();
    handleInputChange(e);
  }, [handleInputChange, disableVoiceMode]);

  const handleChatSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      setChatError(null);
      handleSubmit(e);
    },
    [handleSubmit],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-trigger message after LinkedIn import (G4)
  useEffect(() => {
    const IMPORT_TRIGGER_MSG: Record<string, string> = {
      en: "I just imported my LinkedIn profile.",
      it: "Ho importato il mio profilo LinkedIn.",
      de: "Ich habe mein LinkedIn-Profil importiert.",
      fr: "Je viens d'importer mon profil LinkedIn.",
      es: "Acabo de importar mi perfil de LinkedIn.",
      pt: "Acabei de importar meu perfil do LinkedIn.",
      ja: "LinkedInのプロフィールをインポートしました。",
      zh: "我刚刚导入了我的LinkedIn个人资料。",
    };
    const handler = () => {
      const triggerText = IMPORT_TRIGGER_MSG[language] || IMPORT_TRIGGER_MSG.en;
      append(
        { role: "user", content: triggerText },
        { body: { language, metadata: { source: "auto_import_trigger" } } },
      );
    };
    window.addEventListener("openself:import-complete", handler);
    return () => window.removeEventListener("openself:import-complete", handler);
  }, [append, language]);

  const handleRequestPublish = useCallback(async (usernameOverride?: string) => {
    setRequestingPublish(true);
    setPublishRequestError(null);
    try {
      const body: Record<string, string> = {};
      if (usernameOverride) body.username = usernameOverride;
      const res = await fetch("/api/draft/request-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setPublishRequested(true);
      } else {
        setPublishRequestError(friendlyError(data.code, t));
      }
    } catch {
      setPublishRequestError(t.networkError);
    } finally {
      setRequestingPublish(false);
    }
  }, [t]);

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
            />
          ))}
          {isLoading &&
            messages[messages.length - 1]?.role === "user" && (
              <MessageBubble role="assistant" content="" isStreaming />
            )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {limitReached ? (
        <LimitReachedUI
          language={language}
          authState={authState}
          onSignupRequest={onSignupRequest}
          requestingPublish={requestingPublish}
          publishRequested={publishRequested}
          publishRequestError={publishRequestError}
          handleRequestPublish={handleRequestPublish}
          oauthUsername={oauthUsername}
          setOauthUsername={setOauthUsername}
        />
      ) : (
        <>
          {chatError && (
            <div role="alert" className="flex items-center gap-2 border-t bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              <span className="flex-1">{chatError}</span>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setChatError(null);
                  reload();
                }}
                className="shrink-0 rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t.chatRetry}
              </button>
              <button
                type="button"
                onClick={refreshChat}
                className="shrink-0 rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900"
              >
                {t.chatRefresh}
              </button>
            </div>
          )}
          <ChatInput
            value={input}
            onChange={handleTyping}
            onSubmit={handleChatSubmit}
            isLoading={isLoading}
            placeholder={t.typeMessage}
          />
        </>
      )}
    </div>
  );
}
