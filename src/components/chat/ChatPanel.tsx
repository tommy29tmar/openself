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

/**
 * Welcome messages for first-time visitors.
 * These ask the user's name as the very first interaction.
 */
const FIRST_VISIT_WELCOME: Record<string, string> = {
  en: "Hi! I create personal pages from a conversation. What's your name?",
  it: "Ciao! Creo pagine personali partendo da una conversazione. Come ti chiami?",
  de: "Hallo! Ich erstelle persönliche Seiten aus einem Gespräch. Wie heißt du?",
  fr: "Salut\u00a0! Je crée des pages personnelles à partir d'une conversation. Comment tu t'appelles\u00a0?",
  es: "¡Hola! Creo páginas personales a partir de una conversación. ¿Cómo te llamas?",
  pt: "Olá! Crio páginas pessoais a partir de uma conversa. Como te chamas?",
  ja: "こんにちは！会話からパーソナルページを作ります。お名前は？",
  zh: "你好！我通过对话创建个人页面。你叫什么名字？",
};

/**
 * Welcome messages for returning users with no page yet.
 */
const RETURNING_WELCOME: Record<string, string> = {
  en: "Welcome back! Ready to pick up where we left off?",
  it: "Bentornato! Riprendiamo da dove eravamo rimasti?",
  de: "Willkommen zurück! Sollen wir weitermachen, wo wir aufgehört haben?",
  fr: "Re-bonjour\u00a0! On reprend là où on en était\u00a0?",
  es: "¡Bienvenido de nuevo! ¿Seguimos donde lo dejamos?",
  pt: "Bem-vindo de volta! Continuamos de onde parámos?",
  ja: "おかえりなさい！前回の続きから始めましょうか？",
  zh: "欢迎回来！我们继续之前的对话吧？",
};

/**
 * Welcome messages for users with a draft page ready.
 */
const DRAFT_READY_WELCOME: Record<string, string> = {
  en: "Welcome back! Your page is ready for review — take a look on the right. Want to make any changes?",
  it: "Bentornato! La tua pagina è pronta — dai un'occhiata a destra. Vuoi modificare qualcosa?",
  de: "Willkommen zurück! Deine Seite ist fertig — schau rechts. Möchtest du etwas ändern?",
  fr: "Re-bonjour\u00a0! Ta page est prête — jette un œil à droite. Tu veux modifier quelque chose\u00a0?",
  es: "¡Bienvenido! Tu página está lista — mira a la derecha. ¿Quieres cambiar algo?",
  pt: "Bem-vindo! A tua página está pronta — vê à direita. Queres mudar alguma coisa?",
  ja: "おかえりなさい！ページの準備ができています — 右側をご覧ください。変更はありますか？",
  zh: "欢迎回来！你的页面已准备好——看看右边。想做什么修改吗？",
};

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
};

function buildWelcomeMessage(
  language: string,
  bootstrap: BootstrapResponse | null,
): StoredMessage {
  const lang = language || "en";

  if (!bootstrap) {
    // Neutral fallback — NOT first-visit copy (returning users would get confused)
    const neutral: Record<string, string> = {
      en: "Hey! What would you like to work on?",
      it: "Ciao! Su cosa vuoi lavorare?",
      de: "Hey! Woran möchtest du arbeiten?",
      fr: "Salut\u00a0! Sur quoi veux-tu travailler\u00a0?",
      es: "¡Hola! ¿En qué quieres trabajar?",
      pt: "Olá! Em que queres trabalhar?",
      ja: "こんにちは！何に取り組みますか？",
      zh: "你好！想做什么？",
    };
    return { id: "welcome", role: "assistant", content: neutral[lang] ?? neutral.en };
  }

  switch (bootstrap.journeyState) {
    case "first_visit":
      return { id: "welcome", role: "assistant", content: FIRST_VISIT_WELCOME[lang] ?? FIRST_VISIT_WELCOME.en };

    case "returning_no_page":
      return { id: "welcome", role: "assistant", content: RETURNING_WELCOME[lang] ?? RETURNING_WELCOME.en };

    case "draft_ready":
      return { id: "welcome", role: "assistant", content: DRAFT_READY_WELCOME[lang] ?? DRAFT_READY_WELCOME.en };

    case "blocked": {
      return { id: "welcome", role: "assistant", content: LIMIT_MESSAGES[lang] ?? LIMIT_MESSAGES.en };
    }

    case "active_fresh":
    case "active_stale": {
      const name = bootstrap.userName;
      const templates: Record<string, string> = {
        en: name ? `Hey ${name}! What would you like to update?` : "Hey! What would you like to update?",
        it: name ? `Ciao ${name}! Cosa vuoi aggiornare?` : "Ciao! Cosa vuoi aggiornare?",
        de: name ? `Hey ${name}! Was möchtest du aktualisieren?` : "Hey! Was möchtest du aktualisieren?",
        fr: name ? `Salut ${name}\u00a0! Que veux-tu mettre à jour\u00a0?` : "Salut\u00a0! Que veux-tu mettre à jour\u00a0?",
        es: name ? `¡Hola ${name}! ¿Qué quieres actualizar?` : "¡Hola! ¿Qué quieres actualizar?",
        pt: name ? `Olá ${name}! O que queres atualizar?` : "Olá! O que queres atualizar?",
        ja: name ? `${name}さん！何を更新しますか？` : "何を更新しますか？",
        zh: name ? `${name}，你好！想更新什么？` : "你好！想更新什么？",
      };
      return { id: "welcome", role: "assistant", content: templates[lang] ?? templates.en };
    }

    default:
      return { id: "welcome", role: "assistant", content: FIRST_VISIT_WELCOME[lang] ?? FIRST_VISIT_WELCOME.en };
  }
}

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
  const [initialMessages, setInitialMessages] = useState<StoredMessage[]>(() => [
    buildWelcomeMessage(language, null),
  ]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    if (disableInitialFetch) {
      // Use pre-fetched data from parent
      const bootstrap = initialBootstrap as BootstrapResponse | null;
      const smartWelcome = buildWelcomeMessage(language, bootstrap);

      const restoredMessages: StoredMessage[] = (propMessages ?? [])
        .filter((m): m is {id: string; role: string; content: string} =>
          (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ id: m.id, role: m.role as StoredMessage["role"], content: m.content }));

      if (restoredMessages.length === 0) {
        setInitialMessages([smartWelcome]);
      } else {
        const welcomeAlreadyStored = restoredMessages.some(m => m.role === "assistant" && m.id === "welcome");
        setInitialMessages(welcomeAlreadyStored ? restoredMessages : [smartWelcome, ...restoredMessages]);
      }
      setHistoryLoaded(true);
      return;
    }

    let cancelled = false;

    const load = async () => {
      // Fetch bootstrap and history in parallel
      let bootstrap: BootstrapResponse | null = null;
      let historyRes: Response | null = null;

      try {
        const [bootstrapRes, messagesRes] = await Promise.all([
          fetch("/api/chat/bootstrap", { cache: "no-store" }),
          fetch("/api/messages", { cache: "no-store" }),
        ]);
        if (bootstrapRes.ok) {
          bootstrap = await bootstrapRes.json();
        }
        historyRes = messagesRes;
      } catch {
        // Fetch failed — will use static fallback for bootstrap, no history
      }

      // Compute smart welcome based on bootstrap
      const smartWelcome = buildWelcomeMessage(language, bootstrap);

      try {
        const res = historyRes ?? await fetch("/api/messages", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/invite";
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setInitialMessages([smartWelcome]);
            setHistoryLoaded(true);
          }
          return;
        }

        const data = (await res.json()) as MessagesResponse;
        if (!data.success || !Array.isArray(data.messages)) {
          if (!cancelled) {
            setInitialMessages([smartWelcome]);
            setHistoryLoaded(true);
          }
          return;
        }

        const restoredMessages: StoredMessage[] = data.messages
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

        if (cancelled) return;

        setInitialMessages(() => {
          if (restoredMessages.length === 0) return [smartWelcome];

          const welcomeAlreadyStored = restoredMessages.some(
            (message) => message.role === "assistant" && message.id === "welcome",
          );

          if (welcomeAlreadyStored) {
            return restoredMessages;
          }

          return [smartWelcome, ...restoredMessages];
        });
      } catch {
        if (!cancelled) {
          setInitialMessages([smartWelcome]);
        }
      } finally {
        if (!cancelled) {
          setHistoryLoaded(true);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [language, disableInitialFetch, initialBootstrap, propMessages]);

  if (!historyLoaded) {
    return <ChatPanelLoading />;
  }

  return (
    <ChatPanelInner
      language={language}
      authV2={authV2}
      initialMessages={initialMessages}
      authState={authState}
      onSignupRequest={onSignupRequest}
      isPrimaryVoiceConsumer={isPrimaryVoiceConsumer}
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


  const { messages, input, handleInputChange, handleSubmit, isLoading, reload, setMessages, append } =
    useChat({
      api: "/api/chat",
      body: { language },
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
      const welcomeAlreadyStored = restored.some(
        (msg) => msg.role === "assistant" && msg.id === "welcome",
      );
      const welcome = buildWelcomeMessage(language, null);
      const normalizedMessages = welcomeAlreadyStored ? restored : [welcome, ...restored];
      setMessages(normalizedMessages);
      setChatError(null);
      const lastAssistant = [...normalizedMessages].reverse().find(m => m.role === "assistant");
      return !!(lastAssistant?.content?.trim());
    } catch {
      // Keep current state if refresh fails
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
                onClick={() => {
                  setChatError(null);
                  reload();
                }}
                className="shrink-0 rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700"
              >
                {t.chatRetry}
              </button>
              <button
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
