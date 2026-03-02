import { streamText, generateText, type CoreMessage } from "ai";
import { getModelForTier, getModelIdForTier, getProviderName } from "@/lib/ai/provider";
import { assembleContext } from "@/lib/agent/context";
import { assembleBootstrapPayload } from "@/lib/agent/journey";
import { createAgentTools } from "@/lib/agent/tools";
import { filterToolsByJourneyState } from "@/lib/agent/tool-filter";
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
import { mergeSessionMeta } from "@/lib/services/session-metadata";
import { AUTH_MESSAGE_LIMIT } from "@/lib/constants";

/** Fallback messages when step exhaustion leaves no text reply. Keyed by language. */
const STEP_EXHAUSTION_FALLBACK: Record<string, string> = {
  en: "I've updated your profile. Let me know if you'd like any changes.",
  it: "Ho aggiornato il tuo profilo. Dimmi se vuoi modificare qualcosa.",
  de: "Ich habe dein Profil aktualisiert. Sag mir, wenn du etwas ändern möchtest.",
  fr: "J'ai mis à jour votre profil. Dites-moi si vous souhaitez des modifications.",
  es: "He actualizado tu perfil. Dime si quieres hacer algún cambio.",
  pt: "Atualizei o seu perfil. Diga-me se quiser fazer alguma alteração.",
  ja: "プロフィールを更新しました。変更があればお知らせください。",
  zh: "我已更新了你的个人资料。如果需要修改请告诉我。",
};

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
  const authInfoForBootstrap = chatAuthCtx
    ? { authenticated: !!chatAuthCtx.userId, username: chatAuthCtx.username ?? null }
    : undefined;
  // Extract last user message for archetype signal detection
  const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
  const lastUserMessageText = lastUserMsg
    ? (typeof lastUserMsg.content === "string" ? lastUserMsg.content : null)
    : null;
  const { payload: bootstrap, data: bootstrapData } = assembleBootstrapPayload(effectiveScope, sessionLanguage, authInfoForBootstrap, lastUserMessageText ?? undefined);

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
    bootstrapData,
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
  const modelId = getModelIdForTier("standard");
  const MAX_STEPS = 12; // batch_facts reduces per-turn tool calls; 12 gives headroom for complex turns

  try {
    const model = getModelForTier("standard");
    const { tools: agentTools, getJournal } = createAgentTools(sessionLanguage, writeSessionId, effectiveScope.cognitiveOwnerKey, requestId, effectiveScope.knowledgeReadKeys, mode);
    const tools = filterToolsByJourneyState(agentTools, bootstrap.journeyState);
    const result = streamText({
      model,
      system: systemPrompt,
      messages: safeMessages,
      tools,
      maxSteps: MAX_STEPS,
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
      onFinish: async ({ text, usage, finishReason }) => {
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

        // Persist operation journal + detect step exhaustion
        const journal = getJournal();
        if (journal.length > 0) {
          const metaUpdate: Record<string, unknown> = { journal };
          if (finishReason === "tool-calls") {
            // Step exhaustion: model wanted more tool calls but hit maxSteps
            metaUpdate.pendingOperations = {
              timestamp: new Date().toISOString(),
              journal,
              finishReason: "step_exhaustion",
            };
          } else {
            // Successful completion: clear any stale pendingOperations from previous turns
            metaUpdate.pendingOperations = null;
          }
          try { mergeSessionMeta(writeSessionId, metaUpdate); } catch (e) {
            console.warn("[chat] journal persistence failed:", e);
          }
        } else {
          // No tool calls this turn — still clear any stale pendingOps
          try { mergeSessionMeta(writeSessionId, { pendingOperations: null }); } catch { /* best-effort */ }
        }

        // Step exhaustion with no text: save a synthetic assistant message
        // so the client can recover by refreshing from DB
        if (finishReason === "tool-calls" && (!text || !text.trim())) {
          try {
            const syntheticText = STEP_EXHAUSTION_FALLBACK[sessionLanguage] ?? STEP_EXHAUSTION_FALLBACK.en;
            db.insert(messagesTable)
              .values({
                id: randomUUID(),
                sessionId: messageSessionId,
                role: "assistant",
                content: syntheticText,
              })
              .run();
          } catch (e) {
            console.warn("[chat] synthetic message persistence failed:", e);
          }
        }

        // Enqueue summary generation (best-effort, non-blocking)
        enqueueSummaryJob(effectiveScope.cognitiveOwnerKey, effectiveScope.knowledgeReadKeys);
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
