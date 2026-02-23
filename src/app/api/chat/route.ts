import { streamText } from "ai";
import { getModel, getProviderName, getModelId } from "@/lib/ai/provider";
import { getSystemPromptText } from "@/lib/agent/prompts";
import { createAgentTools } from "@/lib/agent/tools";
import { getAllFacts } from "@/lib/services/kb-service";
import { db } from "@/lib/db";
import { messages as messagesTable } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkBudget, recordUsage } from "@/lib/services/usage-service";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import {
  isMultiUserEnabled,
  getSession,
  tryIncrementMessageCount,
  getMessageLimit,
  getMessageCount,
} from "@/lib/services/session-service";

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

  // Resolve session ID
  const multiUser = isMultiUserEnabled();
  let sessionId: string;

  if (multiUser) {
    sessionId = getSessionIdFromRequest(req);
    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
    const session = getSession(sessionId);
    if (!session) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check message limit (only count user messages)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "user") {
      const limit = getMessageLimit();
      if (!tryIncrementMessageCount(sessionId, limit)) {
        const count = getMessageCount(sessionId);
        return new Response(
          JSON.stringify({
            error: "Message limit reached. Register to continue.",
            messageCount: count,
            messageLimit: limit,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "X-Message-Count": String(count),
              "X-Message-Limit": String(limit),
            },
          },
        );
      }
    }
  } else {
    // Single-user: use body sessionId for backward compat
    sessionId = body.sessionId || randomUUID();
  }

  const sid = sessionId;

  // Build system prompt with current KB context
  const existingFacts = getAllFacts(sessionId);
  const factsContext =
    existingFacts.length > 0
      ? `\n\n---\n\nKNOWN FACTS ABOUT THE USER (${existingFacts.length} facts):\n${existingFacts
          .map(
            (f) =>
              `- [${f.category}/${f.key}]: ${JSON.stringify(f.value)}`,
          )
          .join("\n")}`
      : "";

  const sessionLanguage = language || "en";

  const systemPrompt =
    getSystemPromptText("onboarding", sessionLanguage) + factsContext;

  // Persist the latest user message
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "user") {
    db.insert(messagesTable)
      .values({
        id: randomUUID(),
        sessionId: sid,
        role: "user",
        content: lastMessage.content,
      })
      .run();
  }

  const provider = getProviderName();
  const modelId = getModelId();

  // Build response headers with message count info (multi-user)
  const extraHeaders: Record<string, string> = {};
  if (multiUser) {
    const count = getMessageCount(sessionId);
    const limit = getMessageLimit();
    extraHeaders["X-Message-Count"] = String(count);
    extraHeaders["X-Message-Limit"] = String(limit);
  }

  try {
    const model = getModel();
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools: createAgentTools(sessionLanguage, sessionId),
      maxSteps: 5, // Allow up to 5 tool-calling rounds per turn
      onFinish: async ({ text, usage }) => {
        if (text) {
          db.insert(messagesTable)
            .values({
              id: randomUUID(),
              sessionId: sid,
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
      },
    });

    return result.toDataStreamResponse({
      headers: extraHeaders,
      getErrorMessage: (error) => {
        console.error("[chat] Stream error:", error);
        if (error instanceof Error) return error.message;
        return String(error);
      },
    });
  } catch (error) {
    console.error("[chat] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
