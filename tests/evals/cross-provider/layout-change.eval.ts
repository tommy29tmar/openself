/**
 * Cross-provider eval: Layout change with explain-before-act
 *
 * Scenario: User asks to change layout. Agent should explain before executing.
 * Expected: Agent describes the change and its impact before acting.
 *
 * LLM usage: Real conversation generation, no tool execution.
 * Pipeline-aware: uses buildSystemPrompt() with active_fresh/familiar bootstrap.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";
import {
  getTestProviders,
  setProvider,
  assertContainsAtLeast,
  type TestProvider,
} from "./setup";

const providers = getTestProviders();

function buildFamiliarUserPrompt(): string {
  const bootstrap: BootstrapPayload = {
    journeyState: "active_fresh",
    situations: [],
    expertiseLevel: "familiar",
    userName: "Marco",
    lastSeenDaysAgo: 2,
    publishedUsername: "marco",
    pendingProposalCount: 0,
    thinSections: [],
    staleFacts: [],
    openConflicts: [],
    language: "en",
    conversationContext: null,
  };
  return buildSystemPrompt(bootstrap);
}

describe.each(providers)("layout-change [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("explains the impact when user asks about layouts", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "I think my page could look better. What layout options do I have?" },
      ],
    });

    assertContainsAtLeast(
      text,
      ["sidebar", "bento", "vertical", "grid", "column", "layout"],
      2,
      "Should describe available layout options"
    );
  });

  it("asks for confirmation before changing layout", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "I'd like to try a different layout, maybe something more modern." },
      ],
    });

    assertContainsAtLeast(
      text,
      ["would you like", "want me to", "sound good", "shall I", "how about", "recommend", "suggest", "try", "option"],
      1,
      "Should ask for confirmation or present options"
    );
  });

  it("acts directly with brief confirmation when user gives explicit instruction", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "Switch to the bento layout." },
      ],
    });

    assertContainsAtLeast(
      text,
      ["bento", "switch", "chang", "done", "preview", "right"],
      1,
      "Should acknowledge the explicit instruction"
    );
    const words = text.trim().split(/\s+/).length;
    expect(words).toBeLessThan(100);
  });
});
