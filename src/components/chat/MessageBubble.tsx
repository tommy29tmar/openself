import { cn } from "@/lib/utils";
import MarkdownIt from "markdown-it";

// SECURITY: html defaults to false — markdown-it escapes all HTML tags.
// Do NOT enable html: true — assistant content is rendered via dangerouslySetInnerHTML.
const md = new MarkdownIt({ breaks: true, linkify: true });

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
        {isUser ? content : (
          <div
            className="[&>p]:mb-1.5 [&>ul]:mb-1.5 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:mb-1.5 [&>ol]:list-decimal [&>ol]:pl-4 [&>p:last-child]:mb-0 [&_strong]:font-semibold [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: md.render(content) }}
          />
        )}
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
