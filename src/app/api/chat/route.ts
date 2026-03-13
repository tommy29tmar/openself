import { streamText, generateText, type CoreMessage } from "ai";
import { getModelForTier, getModelIdForTier, getProviderForTier, getThinkingProviderOptions } from "@/lib/ai/provider";
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
import { enqueueJob } from "@/lib/worker/index";
import { mergeSessionMeta } from "@/lib/services/session-metadata";
import { AUTH_MESSAGE_LIMIT } from "@/lib/constants";
import { pruneUnconfirmedPendings } from "@/lib/services/confirmation-service";
import { consumeImportEvent, markImportEventConsumed, revertImportEvent, type ImportEventFlag } from "@/lib/connectors/import-event";
import { analyzeImportGaps, type ImportGapReport } from "@/lib/connectors/import-gap-analyzer";
import { getActiveFacts } from "@/lib/services/kb-service";
import { STEP_EXHAUSTION_FALLBACK } from "@/lib/agent/step-exhaustion-fallback";
import { updateLastReferencedAt } from "@/lib/services/memory-service";
import { stringifyToolArgsForRepair, stripMarkdownCodeFences } from "@/lib/agent/tool-call-repair";
import {
  createUnbackedActionClaimTransform,
  sanitizeUnbackedActionClaim,
} from "@/lib/agent/action-claim-guard";
import { classifyChatError, formatChatErrorResponse } from "@/lib/services/chat-errors";

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
  const requestId = randomUUID();

  // Rate limiting
  const rateResult = checkRateLimit(req);
  if (!rateResult.allowed) {
    return new Response(
      JSON.stringify({ error: rateResult.reason, code: "AI_RATE_LIMITED", requestId }),
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
      JSON.stringify({ code: "BUDGET_EXCEEDED", requestId }),
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

  const sessionLanguage = language || "en";

  // Log auto-import trigger for telemetry (G4)
  if (body.metadata?.source === "auto_import_trigger") {
    console.info("[chat] auto-import trigger message", { requestId });
  }

  // Resolve auth for context injection
  const chatAuthCtx = multiUser ? getAuthContext(req) : null;
  const authInfoForBootstrap = chatAuthCtx
    ? {
        authenticated: !!(chatAuthCtx.userId || chatAuthCtx.username),
        username: chatAuthCtx.username ?? null,
      }
    : undefined;

  // --- Journey Intelligence: assemble bootstrap payload ---
  // Must run BEFORE quota enforcement so the message count read by bootstrap
  // reflects the pre-increment state (avoids false "blocked" on the Nth message).
  // Extract last user message for archetype signal detection
  const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
  const lastUserMessageText = lastUserMsg
    ? (typeof lastUserMsg.content === "string" ? lastUserMsg.content : null)
    : null;
  // Layer 0: clear stale pending confirmations if user's message is NOT confirmatory
  pruneUnconfirmedPendings(writeSessionId, lastUserMessageText, sessionLanguage);

  const { payload: bootstrap, data: bootstrapData } = assembleBootstrapPayload(effectiveScope, sessionLanguage, authInfoForBootstrap, lastUserMessageText ?? undefined);

  // Quota enforcement
  const isAuthenticated = multiUser && !!authInfoForBootstrap?.authenticated;

  const extraHeaders: Record<string, string> = {};
  let quotaInfo: { remaining: number; limit: number } | undefined;

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

      const postCount = getMessageCount(sessionId);
      extraHeaders["X-Message-Count"] = String(postCount);
      extraHeaders["X-Message-Limit"] = String(limit);
      quotaInfo = { remaining: Math.max(0, limit - postCount), limit };
    }
  }

  // --- Import event: consume flag if pending (after quota checks) ---
  let importGapReport: ImportGapReport | undefined;
  const importFlag: ImportEventFlag | null = consumeImportEvent(writeSessionId);
  if (importFlag) {
    const allFacts = getActiveFacts(writeSessionId, effectiveScope.knowledgeReadKeys);
    importGapReport = analyzeImportGaps(allFacts);
  }

  if (importGapReport) {
    bootstrap.importGapReport = importGapReport;
    // Ensure situation is present even if createdAt-based detection missed it (re-import/upsert)
    if (!bootstrap.situations.includes("has_recent_import")) {
      bootstrap.situations.push("has_recent_import");
    }
  }

  // Assemble context using full context system (mode detection, soul, memories, summaries, conflicts)
  const { systemPrompt, trimmedMessages, mode, referencedMemoryIds } = assembleContext(
    effectiveScope,
    sessionLanguage,
    messages,
    authInfoForBootstrap,
    bootstrap,
    bootstrapData,
    quotaInfo,
    messageSessionId,
  );

  // --- UAT context monitor (temporary) ---
  const _sysChars = systemPrompt.length;
  const _msgChars = trimmedMessages.reduce((s, m) => s + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length), 0);
  const _sysTokens = Math.ceil(_sysChars / 4);
  const _msgTokens = Math.ceil(_msgChars / 4);
  console.log(`[CTX] mode=${mode} msgs=${trimmedMessages.length} sysPrompt=~${_sysTokens}tok(${_sysChars}ch) msgs=~${_msgTokens}tok(${_msgChars}ch) total=~${_sysTokens + _msgTokens}tok journey=${bootstrap.journeyState}`);
  // --- end UAT context monitor ---

  // Role whitelist: AI SDK expects only these roles
  const VALID_ROLES = new Set(["user", "assistant", "system", "tool"]);
  const safeMessages = trimmedMessages.filter(m => VALID_ROLES.has(m.role)) as CoreMessage[];

  // Persist the latest user message
  const lastMessage = messages[messages.length - 1];
  let latestUserMessageId: string | undefined;
  if (lastMessage?.role === "user") {
    latestUserMessageId = randomUUID();
    db.insert(messagesTable)
      .values({
        id: latestUserMessageId,
        sessionId: messageSessionId,
        role: "user",
        content: lastMessage.content,
      })
      .run();
  }

  const provider = getProviderForTier("standard");
  const modelId = getModelIdForTier("standard");
  const MAX_STEPS = 12; // batch_facts reduces per-turn tool calls; 12 gives headroom for complex turns
  try {
    const model = getModelForTier("standard");
    const { tools: agentTools, getJournal } = createAgentTools(
      sessionLanguage,
      writeSessionId,
      effectiveScope.cognitiveOwnerKey,
      requestId,
      effectiveScope.knowledgeReadKeys,
      mode,
      authInfoForBootstrap,
      messageSessionId,
      latestUserMessageId,
    );
    const tools = filterToolsByJourneyState(agentTools, bootstrap.journeyState);
    let stepCounter = 0;
    const result = streamText({
      model,
      system: systemPrompt,
      messages: safeMessages,
      tools,
      maxSteps: MAX_STEPS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      experimental_transform: createUnbackedActionClaimTransform(sessionLanguage) as any,
      providerOptions: getThinkingProviderOptions(),
      onStepFinish: async (stepResult) => {
        if (stepResult.reasoning) {
          console.info("[thinking]", {
            requestId,
            modelId,
            stepIndex: stepCounter,
            reasoning: stepResult.reasoning,
            finishReason: stepResult.finishReason,
          });
        }
        stepCounter++;
      },
      experimental_repairToolCall: async ({ toolCall, parameterSchema, error }) => {
        // Fast path: strip markdown code fences that Gemini sometimes wraps around JSON
        const rawArgs = stringifyToolArgsForRepair(toolCall.args);
        const stripped = stripMarkdownCodeFences(rawArgs);
        try {
          JSON.parse(stripped);
          return { toolCallType: "function" as const, toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, args: stripped };
        } catch {
          // Fall through to LLM repair
        }

        const schema = parameterSchema({ toolName: toolCall.toolName });
        const { text } = await generateText({
          model,
          prompt: [
            `The tool "${toolCall.toolName}" was called with invalid arguments.`,
            `Error: ${error.message}`,
            ``,
            `Original arguments:`,
            rawArgs,
            ``,
            `Expected JSON Schema:`,
            JSON.stringify(schema, null, 2),
            ``,
            `Produce ONLY valid JSON that satisfies the schema. No explanation, no markdown — just the JSON object.`,
          ].join("\n"),
        });
        // Strip fences from LLM repair response too
        const repairedArgs = stripMarkdownCodeFences(text);
        try {
          JSON.parse(repairedArgs);
          return { toolCallType: "function" as const, toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, args: repairedArgs };
        } catch {
          return null;
        }
      },
      onFinish: async ({ text, usage, finishReason }) => {
        const journal = getJournal();
        const persistedToolCalls = journal.length > 0 ? journal : null;
        const safeText = text
          ? sanitizeUnbackedActionClaim(text, journal, sessionLanguage)
          : text;

        if (safeText) {
          db.insert(messagesTable)
            .values({
              id: randomUUID(),
              sessionId: messageSessionId,
              role: "assistant",
              content: safeText,
              toolCalls: persistedToolCalls,
            })
            .run();
        }

        // Record LLM usage
        const inputTokens = usage?.promptTokens ?? 0;
        const outputTokens = usage?.completionTokens ?? 0;
        if (inputTokens > 0 || outputTokens > 0) {
          recordUsage(provider, modelId, inputTokens, outputTokens);
        }

        // Persist operation journal + detect step exhaustion on the active conversation.
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
          try { mergeSessionMeta(messageSessionId, metaUpdate); } catch (e) {
            console.warn("[chat] journal persistence failed:", e);
          }
        } else {
          // No tool calls this turn — still clear any stale pendingOps
          try { mergeSessionMeta(messageSessionId, { pendingOperations: null }); } catch { /* best-effort */ }
        }

        // No text from model (step exhaustion OR Gemini finishing after tool calls with no follow-up):
        // save a synthetic assistant message so the client can recover by refreshing from DB
        if (!safeText || !safeText.trim()) {
          try {
            const syntheticText =
              STEP_EXHAUSTION_FALLBACK[bootstrap?.journeyState ?? "active_fresh"]?.[sessionLanguage]
              ?? STEP_EXHAUSTION_FALLBACK[bootstrap?.journeyState ?? "active_fresh"]?.en
              ?? STEP_EXHAUSTION_FALLBACK.active_fresh.en;
            db.insert(messagesTable)
              .values({
                id: randomUUID(),
                sessionId: messageSessionId,
                role: "assistant",
                content: syntheticText,
                toolCalls: persistedToolCalls,
              })
              .run();
          } catch (e) {
            console.warn("[chat] synthetic message persistence failed:", e);
          }
        }

        // Import event: mark consumed on success, revert on error (G2)
        if (importFlag) {
          try {
            if (finishReason === "error") {
              revertImportEvent(writeSessionId);
            } else {
              markImportEventConsumed(writeSessionId);
            }
          } catch { /* best-effort */ }
        }

        // Enqueue summary generation (best-effort, non-blocking)
        enqueueSummaryJob(effectiveScope.cognitiveOwnerKey, effectiveScope.knowledgeReadKeys);

        // Enqueue session compaction (best-effort, dedup-safe via UNIQUE constraint)
        try {
          enqueueJob("session_compaction", { ownerKey: effectiveScope.cognitiveOwnerKey, sessionKey: messageSessionId });
        } catch (e) {
          if (!String(e).includes("UNIQUE constraint failed")) {
            console.warn("[chat] Failed to enqueue session_compaction:", e);
          }
        }

        // Update last_referenced_at for memories that survived all truncation phases
        try {
          if (referencedMemoryIds.length > 0) {
            updateLastReferencedAt(referencedMemoryIds);
          }
        } catch (e) {
          console.warn("[chat] Failed to update memory references:", e);
        }
      },
    });

    return result.toDataStreamResponse({
      sendReasoning: false,
      headers: { ...extraHeaders, "X-Request-Id": requestId },
      getErrorMessage: (error) => {
        console.error("[chat] Stream error:", error);
        // Revert import event flag on stream error (G2)
        if (importFlag) {
          try { revertImportEvent(writeSessionId); } catch { /* best-effort */ }
        }
        return formatChatErrorResponse(error, requestId);
      },
    });
  } catch (error) {
    console.error("[chat] Error:", error, { requestId });
    // Revert import event flag on pre-stream error (G2)
    if (importFlag) {
      try { revertImportEvent(writeSessionId); } catch { /* best-effort */ }
    }
    const code = classifyChatError(error);
    return new Response(
      JSON.stringify({ error: "Internal error", code, requestId }),
      { status: code === "AI_RATE_LIMITED" ? 429 : 500, headers: { "Content-Type": "application/json", "X-Request-Id": requestId } },
    );
  }
}
