// src/app/api/chat/bootstrap/route.ts

import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import {
  isMultiUserEnabled,
  DEFAULT_SESSION_ID,
} from "@/lib/services/session-service";
import { assembleBootstrapPayload } from "@/lib/agent/journey";

export async function GET(req: Request) {
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
    ? { authenticated: !!chatAuthCtx.userId, username: chatAuthCtx.username ?? null }
    : undefined;

  // Extract language from query string (default: "en")
  const url = new URL(req.url);
  const language = url.searchParams.get("language") ?? "en";

  const payload = assembleBootstrapPayload(effectiveScope, language, authInfo);

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
