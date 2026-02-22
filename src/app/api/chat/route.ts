import { streamText } from "ai";
import { getModel, getProviderName, getModelId } from "@/lib/ai/provider";
import { getSystemPromptText } from "@/lib/agent/prompts";
import { agentTools } from "@/lib/agent/tools";
import { getAllFacts } from "@/lib/services/kb-service";
import { db } from "@/lib/db";
import { messages as messagesTable } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkBudget, recordUsage } from "@/lib/services/usage-service";

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

  const { messages, sessionId, language } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("messages is required", { status: 400 });
  }

  const sid = sessionId || randomUUID();

  // Build system prompt with current KB context
  const existingFacts = getAllFacts();
  const factsContext =
    existingFacts.length > 0
      ? `\n\n---\n\nKNOWN FACTS ABOUT THE USER (${existingFacts.length} facts):\n${existingFacts
          .map(
            (f) =>
              `- [${f.category}/${f.key}]: ${JSON.stringify(f.value)}`,
          )
          .join("\n")}`
      : "";

  const systemPrompt =
    getSystemPromptText("onboarding", language || "en") + factsContext;

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

  try {
    const model = getModel();
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools: agentTools,
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
