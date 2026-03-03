import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getDraft, computeConfigHash } from "@/lib/services/page-service";
import { getActiveFacts } from "@/lib/services/kb-service";
import { getPreferences } from "@/lib/services/preferences-service";
import { projectCanonicalConfig, publishableFromCanonical } from "@/lib/services/page-projection";
import { mergeActiveSectionCopy } from "@/lib/services/personalization-projection";

export const runtime = "nodejs";

/**
 * GET /api/preview/stream
 *
 * SSE endpoint for real-time preview updates.
 * Always composes from facts using shared projection — never serves draft.config raw.
 *
 * Two hashes:
 * - previewHash: detects ALL changes (including incomplete sections) for SSE invalidation
 * - publishableHash: sent as configHash in event payload (matches publish pipeline)
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

        const facts = getActiveFacts(writeSessionId, readKeys);
        const draft = getDraft(writeSessionId);

        if (facts.length > 0) {
          const canonicalUsername = draft?.username ?? "draft";
          const { factLanguage, language } = getPreferences(writeSessionId);
          const factLang = factLanguage ?? language ?? "en";

          const draftMeta = draft
            ? {
                surface: draft.config.surface,
                voice: draft.config.voice,
                light: draft.config.light,
                style: draft.config.style,
                layoutTemplate: draft.config.layoutTemplate,
                sections: draft.config.sections,
              }
            : undefined;

          // Resolve profileId for avatar lookup
          const profileId = scope?.cognitiveOwnerKey ?? "__default__";

          // Canonical config: all sections for display
          const previewConfig = projectCanonicalConfig(
            facts,
            canonicalUsername,
            factLang,
            draftMeta,
            profileId,
          );

          // Merge personalized copy (hash-guarded, stale → deterministic fallback)
          const ownerKey = writeSessionId;
          const personalizedConfig = mergeActiveSectionCopy(previewConfig, ownerKey, factLang);

          // previewHash: detects ALL changes (including incomplete sections)
          // Use ORIGINAL previewConfig for hash computation (publish path does its own merge)
          const previewHash = computeConfigHash(previewConfig);
          // publishableHash: matches publish pipeline for hash guard
          const publishableHash = computeConfigHash(publishableFromCanonical(previewConfig));

          const changed = previewHash !== lastHash;
          lastHash = previewHash;

          if (changed) {
            unchangedCount = 0;
            sendEvent({
              status: "optimistic_ready",
              publishStatus: draft?.status ?? "draft",
              config: personalizedConfig,
              configHash: publishableHash,
            });
          } else {
            unchangedCount++;
            sendEvent({
              status: "keepalive",
              publishStatus: draft?.status ?? "draft",
              configHash: publishableHash,
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
