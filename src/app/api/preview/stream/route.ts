import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getDraft } from "@/lib/services/page-service";
import { getAllFacts } from "@/lib/services/kb-service";

export const runtime = "nodejs";

/**
 * GET /api/preview/stream
 *
 * SSE endpoint for real-time preview updates.
 * Sends lightweight payload at adaptive intervals (1s → 5s backoff).
 * Falls back to polling if SSE not supported.
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

        const draft = getDraft(writeSessionId);
        if (draft) {
          const changed = draft.configHash !== lastHash;
          lastHash = draft.configHash;

          if (changed) {
            unchangedCount = 0;
            sendEvent({
              status: "optimistic_ready",
              publishStatus: draft.status,
              config: draft.config,
              configHash: draft.configHash,
            });
          } else {
            unchangedCount++;
            // Send lightweight keepalive
            sendEvent({
              status: "keepalive",
              publishStatus: draft.status,
              configHash: draft.configHash,
            });
          }
        } else {
          const facts = getAllFacts(writeSessionId, readKeys);
          sendEvent({
            status: facts.length > 0 ? "facts_only" : "idle",
            publishStatus: "draft",
            factCount: facts.length,
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
