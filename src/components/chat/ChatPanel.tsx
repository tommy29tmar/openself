"use client";

import { useChat } from "ai/react";
import { useRef, useEffect } from "react";
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

function getWelcomeMessage(language: string) {
  return {
    id: "welcome",
    role: "assistant" as const,
    content: WELCOME_MESSAGES[language] ?? WELCOME_MESSAGES.en,
  };
}

type ChatPanelProps = {
  language?: string;
};

export function ChatPanel({ language = "en" }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      api: "/api/chat",
      body: { language },
      initialMessages: [getWelcomeMessage(language)],
    });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Chat</h2>
      </div>
      <ScrollArea className="flex-1">
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
      <ChatInput
        value={input}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  );
}
