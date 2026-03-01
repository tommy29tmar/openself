/**
 * Cross-provider eval: Onboarding flow
 *
 * Scenario: New user provides good signal across 5 turns.
 * Expected: Agent extracts facts, generates page, proposes publish.
 *
 * LLM usage: Real conversation generation, mocked tool execution.
 * Pipeline-aware: uses buildSystemPrompt() with first_visit bootstrap.
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
  assertNoneOf,
  type TestProvider,
} from "./setup";

const providers = getTestProviders();

function buildOnboardingPrompt(language = "en"): string {
  const bootstrap: BootstrapPayload = {
    journeyState: "first_visit",
    situations: [],
    expertiseLevel: "novice",
    userName: null,
    lastSeenDaysAgo: null,
    publishedUsername: null,
    pendingProposalCount: 0,
    thinSections: [],
    staleFacts: [],
    openConflicts: [],
    archivableFacts: [],
    language,
    conversationContext: null,
  };
  return buildSystemPrompt(bootstrap);
}

describe.each(providers)("onboarding-flow [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("extracts name from first user message", async () => {
    const systemPrompt = buildOnboardingPrompt("en");
    const { text } = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: [
        { role: "user", content: "Hi! I'm Marco, I'm a software engineer based in Rome." },
      ],
    });

    assertContainsAtLeast(text, ["Marco", "marco"], 1, "Should use the user's name");
    expect(text.length).toBeGreaterThan(10);
    expect(text.length).toBeLessThan(2000);
  });

  it("asks about different topics across turns (breadth-first)", async () => {
    const systemPrompt = buildOnboardingPrompt("en");
    const { text } = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: [
        { role: "user", content: "Hi! I'm Marco, I'm a software engineer based in Rome." },
        { role: "assistant", content: "Hey Marco! Nice to meet you. Software engineering in Rome — that's a great combo. What are you working on these days?" },
        { role: "user", content: "I work at Stripe on the payments API. Been there for 3 years." },
      ],
    });

    const differentAreas = ["hobby", "interest", "fun", "free time", "project", "side", "outside work", "passion", "skill", "proud"];
    assertContainsAtLeast(text, differentAreas, 1, "Should explore a different topic area");
  });

  it("proposes page generation after sufficient signal (5 turns)", async () => {
    const systemPrompt = buildOnboardingPrompt("en");
    const { text } = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: [
        { role: "user", content: "Hi! I'm Marco, I'm a software engineer based in Rome." },
        { role: "assistant", content: "Hey Marco! Software engineering in Rome — nice. What are you working on?" },
        { role: "user", content: "I work at Stripe on the payments API. Been there for 3 years." },
        { role: "assistant", content: "Stripe — impressive! What do you do for fun outside of work?" },
        { role: "user", content: "I love cycling and I'm really into photography. I also contribute to open source." },
        { role: "assistant", content: "That's a great mix! Any particular open source projects?" },
        { role: "user", content: "I maintain a popular TypeScript testing library on GitHub. Got about 5k stars." },
        { role: "assistant", content: "Very cool! With your engineering background, cycling, photography, and a popular open source project, you've got a compelling profile. Any skills or tools you'd want to highlight?" },
        { role: "user", content: "TypeScript, Go, React, and Kubernetes. I'm also pretty good at system design." },
      ],
    });

    assertContainsAtLeast(
      text,
      ["page", "build", "put together", "generate", "create", "preview", "ready", "enough"],
      2,
      "Should propose building the page"
    );
  });

  it("does not fabricate information", async () => {
    const systemPrompt = buildOnboardingPrompt("en");
    const { text } = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: [
        { role: "user", content: "I'm Ana. I teach math at a high school." },
      ],
    });

    assertNoneOf(
      text,
      ["PhD", "university", "professor", "research", "published"],
      "Should not fabricate academic credentials"
    );
  });

  it("keeps responses concise (under 5 sentences for normal turns)", async () => {
    const systemPrompt = buildOnboardingPrompt("en");
    const { text } = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: [
        { role: "user", content: "I'm Carlos, I'm a graphic designer in Barcelona." },
      ],
    });

    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
    expect(sentences.length).toBeLessThanOrEqual(5);
  });
});
