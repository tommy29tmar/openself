import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getDraft, computeConfigHash } from "@/lib/services/page-service";
import { getAllFacts } from "@/lib/services/kb-service";
import { getPreferences } from "@/lib/services/preferences-service";
import { projectPublishableConfig } from "@/lib/services/page-projection";

export const runtime = "nodejs";

/**
 * GET /api/preview/stream
 *
 * SSE endpoint for real-time preview updates.
 * Always composes from facts using shared projection — never serves draft.config raw.
 * Change detection uses canonical hash (not draft.configHash).
 */
export async function GET(req: Request) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const writeSessionId = scope?.knowledgePrimaryKey ?? "__default__";
  const readKeys = scope?.knowledgeReadKeys ?? ["__default__"];

  const encoder = new TextEncoder();
  let closed = false;
  let lastHash: string | null = null;
  let unchangedCount = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      const poll = () => {
        if (closed) return;

        const facts = getAllFacts(writeSessionId, readKeys);
        const draft = getDraft(writeSessionId);

        if (facts.length > 0) {
          const canonicalUsername = draft?.username ?? "draft";
          const { factLanguage, language } = getPreferences(writeSessionId);
          const factLang = factLanguage ?? language ?? "en";

          const draftMeta = draft
            ? {
                theme: draft.config.theme,
                style: draft.config.style,
                layoutTemplate: draft.config.layoutTemplate,
                sections: draft.config.sections,
              }
            : undefined;

          const config = projectPublishableConfig(
            facts,
            canonicalUsername,
            factLang,
            draftMeta,
          );
          const hash = computeConfigHash(config);

          const changed = hash !== lastHash;
          lastHash = hash;

          if (changed) {
            unchangedCount = 0;
            sendEvent({
              status: "optimistic_ready",
              publishStatus: draft?.status ?? "draft",
              config,
              configHash: hash,
            });
          } else {
            unchangedCount++;
            sendEvent({
              status: "keepalive",
              publishStatus: draft?.status ?? "draft",
              configHash: hash,
            });
          }
        } else {
          sendEvent({
            status: "idle",
            publishStatus: "draft",
            factCount: 0,
          });
        }

        // Adaptive interval: 1s when active, up to 5s when unchanged
        const interval = Math.min(1000 + unchangedCount * 500, 5000);
        setTimeout(poll, interval);
      };

      // Initial send
      poll();

      // Keepalive comment every 15s to prevent proxy timeout
      const keepalive = setInterval(() => {
        if (closed) {
          clearInterval(keepalive);
          return;
        }
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          closed = true;
          clearInterval(keepalive);
        }
      }, 15000);
    },

    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx anti-buffer
    },
  });
}
