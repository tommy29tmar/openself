// src/app/api/chat/bootstrap/route.ts

import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import {
  isMultiUserEnabled,
  DEFAULT_SESSION_ID,
} from "@/lib/services/session-service";
import { assembleBootstrapPayload } from "@/lib/agent/journey";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

export async function GET(req: Request) {
  // Rate limiting (same as POST /api/chat)
  const rateResult = checkRateLimit(req, { skipPace: true });
  if (!rateResult.allowed) {
    return new Response(
      JSON.stringify({ error: rateResult.reason }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateResult.retryAfter ?? 1),
        },
      },
    );
  }

  const multiUser = isMultiUserEnabled();
  const scope = resolveOwnerScope(req);

  if (multiUser && !scope) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const effectiveScope = scope ?? {
    cognitiveOwnerKey: DEFAULT_SESSION_ID,
    knowledgeReadKeys: [DEFAULT_SESSION_ID],
    knowledgePrimaryKey: DEFAULT_SESSION_ID,
    currentSessionId: DEFAULT_SESSION_ID,
  };

  // Resolve auth for blocked detection
  const chatAuthCtx = multiUser ? getAuthContext(req) : null;
  const authInfo = chatAuthCtx
    ? {
        authenticated: !!(chatAuthCtx.userId || chatAuthCtx.username),
        username: chatAuthCtx.username ?? null,
      }
    : undefined;

  // Extract language from query string (default: "en")
  const url = new URL(req.url);
  const language = url.searchParams.get("language") ?? "en";

  const { payload } = assembleBootstrapPayload(effectiveScope, language, authInfo);

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
