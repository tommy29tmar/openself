"use client";

import { useChat } from "ai/react";
import { useRef, useEffect, useState, useCallback, type FormEvent } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ChatInput } from "@/components/chat/ChatInput";

const WELCOME_MESSAGES: Record<string, string> = {
  en: "Hey! I\u2019m going to build your personal page. Tell me \u2014 who are you and what are you into?",
  it: "Ciao! Costruir\u00f2 la tua pagina personale. Raccontami \u2014 chi sei e cosa ti appassiona?",
  de: "Hey! Ich werde deine pers\u00f6nliche Seite erstellen. Erz\u00e4hl mir \u2014 wer bist du und was begeistert dich?",
  fr: "Salut\u00a0! Je vais cr\u00e9er ta page personnelle. Dis-moi \u2014 qui es-tu et qu\u2019est-ce qui te passionne\u00a0?",
  es: "\u00a1Hola! Voy a crear tu p\u00e1gina personal. Cu\u00e9ntame \u2014 \u00bfqui\u00e9n eres y qu\u00e9 te apasiona?",
  pt: "Ol\u00e1! Vou criar a tua p\u00e1gina pessoal. Conta-me \u2014 quem \u00e9s e o que te apaixona?",
  ja: "\u3053\u3093\u306b\u3061\u306f\uff01\u3042\u306a\u305f\u306e\u30d1\u30fc\u30bd\u30ca\u30eb\u30da\u30fc\u30b8\u3092\u4f5c\u308a\u307e\u3059\u3002\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u2014\u2014\u3042\u306a\u305f\u306f\u8ab0\u3067\u3059\u304b\uff1f\u4f55\u306b\u60c5\u71b1\u3092\u6ce8\u3044\u3067\u3044\u307e\u3059\u304b\uff1f",
  zh: "\u4f60\u597d\uff01\u6211\u5c06\u4e3a\u4f60\u521b\u5efa\u4e2a\u4eba\u9875\u9762\u3002\u544a\u8bc9\u6211\u2014\u2014\u4f60\u662f\u8c01\uff0c\u4f60\u5bf9\u4ec0\u4e48\u5145\u6ee1\u70ed\u60c5\uff1f",
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

function getWelcomeMessage(language: string) {
  return {
    id: "welcome",
    role: "assistant" as const,
    content: WELCOME_MESSAGES[language] ?? WELCOME_MESSAGES.en,
  };
}

type ChatPanelProps = {
  language?: string;
  /** When true, show email + password fields in the signup form */
  authV2?: boolean;
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
};

function ChatPanelLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Chat</h2>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
        Loading chat history...
      </div>
    </div>
  );
}

export function ChatPanel({ language = "en", authV2 = false }: ChatPanelProps) {
  const [initialMessages, setInitialMessages] = useState<StoredMessage[]>(() => [
    getWelcomeMessage(language),
  ]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const res = await fetch("/api/messages", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/invite";
          return;
        }
        if (!res.ok) return;

        const data = (await res.json()) as MessagesResponse;
        if (!data.success || !Array.isArray(data.messages)) return;

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

        setInitialMessages((current) => {
          const welcome = current[0] ?? getWelcomeMessage("en");
          if (restoredMessages.length === 0) return [welcome];

          const welcomeAlreadyStored = restoredMessages.some(
            (message) =>
              message.role === "assistant" && message.content === welcome.content,
          );

          return welcomeAlreadyStored
            ? restoredMessages
            : [welcome, ...restoredMessages];
        });
      } catch {
        // Keep fallback welcome message when history fetch fails.
      } finally {
        if (!cancelled) {
          setHistoryLoaded(true);
        }
      }
    };

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!historyLoaded) {
    return <ChatPanelLoading />;
  }

  return (
    <ChatPanelInner
      language={language}
      authV2={authV2}
      initialMessages={initialMessages}
    />
  );
}

function ChatPanelInner({
  language,
  authV2,
  initialMessages,
}: ChatPanelInnerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } =
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

        setChatError(error.message || "Unable to generate a response right now.");
      },
    });

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

  const handleRegister = useCallback(async () => {
    if (!registerUsername.trim()) return;
    if (authV2 && (!registerEmail.trim() || !registerPassword.trim())) return;

    setRegistering(true);
    setRegisterError(null);

    try {
      const payload: Record<string, string> = {
        username: registerUsername.trim().toLowerCase(),
      };
      if (authV2) {
        payload.email = registerEmail.trim().toLowerCase();
        payload.password = registerPassword;
      }

      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.status === 401) {
        window.location.href = "/invite";
        return;
      }
      if (data.success) {
        setRegistered(data.username);
      } else {
        setRegisterError(data.error || "Registration failed");
      }
    } catch {
      setRegisterError("Network error");
    } finally {
      setRegistering(false);
    }
  }, [registerUsername, registerEmail, registerPassword, authV2]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Chat</h2>
      </div>
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

      {registered ? (
        <div className="border-t bg-green-50 px-4 py-3 dark:bg-green-950">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            Page published!
          </p>
          <a
            href={`/${registered}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-green-700 underline dark:text-green-300"
          >
            View at /{registered}
          </a>
        </div>
      ) : limitReached ? (
        <div className="space-y-3 border-t bg-amber-50 px-4 py-3 dark:bg-amber-950">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {LIMIT_MESSAGES[language] ?? LIMIT_MESSAGES.en}
          </p>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={registerUsername}
              onChange={(e) => setRegisterUsername(e.target.value.toLowerCase())}
              placeholder="username"
              className="rounded border bg-background px-2 py-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !authV2) handleRegister();
              }}
            />
            {authV2 && (
              <>
                <input
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="email"
                  className="rounded border bg-background px-2 py-1 text-sm"
                  autoComplete="email"
                />
                <input
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder="password (min 8 chars)"
                  minLength={8}
                  className="rounded border bg-background px-2 py-1 text-sm"
                  autoComplete="new-password"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRegister();
                  }}
                />
              </>
            )}
            <button
              onClick={handleRegister}
              disabled={
                registering ||
                !registerUsername.trim() ||
                (authV2 && (!registerEmail.trim() || registerPassword.length < 8))
              }
              className="shrink-0 rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {registering ? "..." : "Claim your page"}
            </button>
          </div>
          {registerError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {registerError}
            </p>
          )}
        </div>
      ) : (
        <>
          {chatError && (
            <div className="border-t bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {chatError}
            </div>
          )}
          <ChatInput
            value={input}
            onChange={handleInputChange}
            onSubmit={handleChatSubmit}
            isLoading={isLoading}
          />
        </>
      )}
    </div>
  );
}
