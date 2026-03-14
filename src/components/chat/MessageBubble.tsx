import { cn } from "@/lib/utils";
import MarkdownIt from "markdown-it";

// SECURITY: html defaults to false — markdown-it escapes all HTML tags.
// Do NOT enable html: true — assistant content is rendered via dangerouslySetInnerHTML.
const md = new MarkdownIt({ breaks: true, linkify: true });
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener noreferrer");
  return self.renderToken(tokens, idx, options);
};

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
        className="max-w-[80%] px-4 py-2.5 text-sm leading-relaxed"
        style={isUser ? {
          background: "rgba(201,169,110,0.12)",
          color: "#e8d5b0",
          border: "1px solid rgba(201,169,110,0.2)",
          borderRadius: 10,
          borderBottomRightRadius: 3,
        } : {
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.8)",
          borderRadius: 10,
          borderBottomLeftRadius: 3,
        }}
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
