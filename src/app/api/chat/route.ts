import { streamText, generateText, type CoreMessage } from "ai";
import { getModel, getProviderName, getModelId } from "@/lib/ai/provider";
import { assembleContext } from "@/lib/agent/context";
import { assembleBootstrapPayload } from "@/lib/agent/journey";
import { createAgentTools } from "@/lib/agent/tools";
import { db, sqlite } from "@/lib/db";
import { messages as messagesTable } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkBudget, recordUsage } from "@/lib/services/usage-service";
import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import {
  isMultiUserEnabled,
  tryIncrementMessageCount,
  getMessageLimit,
  getMessageCount,
  DEFAULT_SESSION_ID,
} from "@/lib/services/session-service";
import { enqueueSummaryJob } from "@/lib/services/summary-service";
import { AUTH_MESSAGE_LIMIT } from "@/lib/constants";

/**
 * Per-profile message quota for authenticated users.
 * Atomic check+increment (single UPDATE with WHERE guard — no race).
 */
function checkAndIncrementQuota(
  profileKey: string,
  limit: number,
): { allowed: boolean; count: number } {
  // Ensure row exists
  sqlite
    .prepare(
      "INSERT INTO profile_message_usage(profile_key, count) VALUES(?, 0) ON CONFLICT(profile_key) DO NOTHING",
    )
    .run(profileKey);

  // Atomic: increment ONLY if under limit
  const result = sqlite
    .prepare(
      "UPDATE profile_message_usage SET count = count + 1, updated_at = datetime('now') WHERE profile_key = ? AND count < ?",
    )
    .run(profileKey, limit);

  const row = sqlite
    .prepare("SELECT count FROM profile_message_usage WHERE profile_key = ?")
    .get(profileKey) as { count: number };

  return { allowed: result.changes === 1, count: row.count };
}

export async function POST(req: Request) {
  // Rate limiting
  const rateResult = checkRateLimit(req);
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

  // Budget check
  const budgetResult = checkBudget();
  if (!budgetResult.allowed) {
    return new Response(
      JSON.stringify({ error: budgetResult.warningMessage }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const body = await req.json();
  const { messages, language } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("messages is required", { status: 400 });
  }

  // Resolve owner scope
  const multiUser = isMultiUserEnabled();
  const scope = resolveOwnerScope(req);

  if (multiUser && !scope) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Use scope keys for reads/writes, fallback to defaults for single-user
  const effectiveScope = scope ?? {
    cognitiveOwnerKey: DEFAULT_SESSION_ID,
    knowledgeReadKeys: [DEFAULT_SESSION_ID],
    knowledgePrimaryKey: DEFAULT_SESSION_ID,
    currentSessionId: DEFAULT_SESSION_ID,
  };

  // Session ID for facts/page writes (anchor)
  const writeSessionId = effectiveScope.knowledgePrimaryKey;
  // Session ID for message writes (current session)
  const messageSessionId = multiUser
    ? effectiveScope.currentSessionId
    : typeof body.sessionId === "string" && body.sessionId.trim().length > 0
      ? body.sessionId
      : DEFAULT_SESSION_ID;

  const requestId = randomUUID();
  const sessionLanguage = language || "en";

  // Resolve auth for context injection
  const chatAuthCtx = multiUser ? getAuthContext(req) : null;

  // --- Journey Intelligence: assemble bootstrap payload ---
  // Must run BEFORE quota enforcement so the message count read by bootstrap
  // reflects the pre-increment state (avoids false "blocked" on the Nth message).
  // TODO(Sprint 2): bootstrap and assembleContext both query facts/soul/conflicts independently.
  // Refactor assembleContext to consume bootstrap data and avoid duplicate DB reads.
  const authInfoForBootstrap = chatAuthCtx
    ? { authenticated: !!chatAuthCtx.userId, username: chatAuthCtx.username ?? null }
    : undefined;
  const bootstrap = assembleBootstrapPayload(effectiveScope, sessionLanguage, authInfoForBootstrap);

  // Quota enforcement
  const isAuthenticated =
    multiUser && effectiveScope.cognitiveOwnerKey !== effectiveScope.currentSessionId;

  const extraHeaders: Record<string, string> = {};

  if (multiUser) {
    const lastMessage = messages[messages.length - 1];
    const isUserMessage = lastMessage?.role === "user";

    if (isAuthenticated) {
      // Authenticated: per-profile quota
      if (isUserMessage) {
        const { allowed, count } = checkAndIncrementQuota(
          effectiveScope.cognitiveOwnerKey,
          AUTH_MESSAGE_LIMIT,
        );
        extraHeaders["X-Message-Count"] = String(count);
        extraHeaders["X-Message-Limit"] = String(AUTH_MESSAGE_LIMIT);
        if (!allowed) {
          return new Response(
            JSON.stringify({
              error: "Message limit reached.",
              messageCount: count,
              messageLimit: AUTH_MESSAGE_LIMIT,
              code: "MESSAGE_LIMIT",
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "X-Message-Count": String(count),
                "X-Message-Limit": String(AUTH_MESSAGE_LIMIT),
                "X-Auth-Status": "authenticated",
              },
            },
          );
        }
      }
    } else {
      // Anonymous: per-session quota (existing behavior)
      const sessionId = effectiveScope.currentSessionId;
      const limit = getMessageLimit();
      const currentCount = getMessageCount(sessionId);
      if (currentCount >= limit) {
        return new Response(
          JSON.stringify({
            error: "Message limit reached. Register to continue.",
            messageCount: currentCount,
            messageLimit: limit,
            code: "MESSAGE_LIMIT",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "X-Message-Count": String(currentCount),
              "X-Message-Limit": String(limit),
              "X-Auth-Status": "anonymous",
            },
          },
        );
      }

      if (isUserMessage) {
        const incremented = tryIncrementMessageCount(sessionId, limit);
        if (!incremented) {
          const latestCount = getMessageCount(sessionId);
          return new Response(
            JSON.stringify({
              error: "Message limit reached. Register to continue.",
              messageCount: latestCount,
              messageLimit: limit,
              code: "MESSAGE_LIMIT",
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "X-Message-Count": String(latestCount),
                "X-Message-Limit": String(limit),
                "X-Auth-Status": "anonymous",
              },
            },
          );
        }
      }

      extraHeaders["X-Message-Count"] = String(getMessageCount(sessionId));
      extraHeaders["X-Message-Limit"] = String(limit);
    }
  }

  // Assemble context using full context system (mode detection, soul, memories, summaries, conflicts)
  const { systemPrompt, trimmedMessages, mode } = assembleContext(
    effectiveScope,
    sessionLanguage,
    messages,
    authInfoForBootstrap,
    bootstrap,
  );

  // Role whitelist: AI SDK expects only these roles
  const VALID_ROLES = new Set(["user", "assistant", "system", "tool"]);
  const safeMessages = trimmedMessages.filter(m => VALID_ROLES.has(m.role)) as CoreMessage[];

  // Persist the latest user message
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "user") {
    db.insert(messagesTable)
      .values({
        id: randomUUID(),
        sessionId: messageSessionId,
        role: "user",
        content: lastMessage.content,
      })
      .run();
  }

  const provider = getProviderName();
  const modelId = getModelId();

  try {
    const model = getModel();
    const result = streamText({
      model,
      system: systemPrompt,
      messages: safeMessages,
      tools: createAgentTools(sessionLanguage, writeSessionId, effectiveScope.cognitiveOwnerKey, requestId, effectiveScope.knowledgeReadKeys, mode),
      maxSteps: 5, // Allow up to 5 tool-calling rounds per turn
      experimental_repairToolCall: async ({ toolCall, parameterSchema, error }) => {
        const schema = parameterSchema({ toolName: toolCall.toolName });
        const { text } = await generateText({
          model,
          prompt: [
            `The tool "${toolCall.toolName}" was called with invalid arguments.`,
            `Error: ${error.message}`,
            ``,
            `Original arguments:`,
            toolCall.args,
            ``,
            `Expected JSON Schema:`,
            JSON.stringify(schema, null, 2),
            ``,
            `Produce ONLY valid JSON that satisfies the schema. No explanation, no markdown — just the JSON object.`,
          ].join("\n"),
        });
        try {
          return { toolCallType: "function" as const, toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, args: text };
        } catch {
          return null;
        }
      },
      onFinish: async ({ text, usage }) => {
        if (text) {
          db.insert(messagesTable)
            .values({
              id: randomUUID(),
              sessionId: messageSessionId,
              role: "assistant",
              content: text,
            })
            .run();
        }

        // Record LLM usage
        const inputTokens = usage?.promptTokens ?? 0;
        const outputTokens = usage?.completionTokens ?? 0;
        if (inputTokens > 0 || outputTokens > 0) {
          recordUsage(provider, modelId, inputTokens, outputTokens);
        }

        // Enqueue summary generation (best-effort, non-blocking)
        enqueueSummaryJob(effectiveScope.cognitiveOwnerKey);
      },
    });

    return result.toDataStreamResponse({
      headers: { ...extraHeaders, "X-Request-Id": requestId },
      getErrorMessage: (error) => {
        console.error("[chat] Stream error:", error);
        if (error instanceof Error) return error.message;
        return String(error);
      },
    });
  } catch (error) {
    console.error("[chat] Error:", error, { requestId });
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json", "X-Request-Id": requestId } },
    );
  }
}
