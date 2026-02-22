import { cn } from "@/lib/utils";

type MessageBubbleProps = {
  role: string;
  content: string;
  isStreaming?: boolean;
};

export function MessageBubble({ role, content, isStreaming }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md",
        )}
      >
        {content}
        {isStreaming && !content && (
          <span className="inline-flex gap-1">
            <span className="animate-pulse">·</span>
            <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>·</span>
            <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>·</span>
          </span>
        )}
      </div>
    </div>
  );
}
