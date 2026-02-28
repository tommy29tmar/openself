/**
 * Cross-provider eval: Publish with incomplete sections
 *
 * Scenario: Agent is asked to publish but page has incomplete sections.
 * Expected: Agent runs preflight check and communicates issues to user.
 *
 * LLM usage: Real conversation generation with preflight results in context.
 * Hardcoded prompt: isolates publish-preflight behavior from pipeline changes.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import {
  getTestProviders,
  setProvider,
  assertContainsAtLeast,
  type TestProvider,
} from "./setup";

const providers = getTestProviders();

const SYSTEM_PROMPT = `You are the OpenSelf agent — a warm AI that helps people build their personal web page.

MODE: STEADY STATE
The user has a draft page with some incomplete sections.

When the user asks to publish, run publish_preflight first to check for issues.
If there are issues, explain them clearly and ask if the user wants to fix them or publish anyway.

PREFLIGHT RESULTS (just ran):
{
  "status": "warnings",
  "issues": [
    {"severity": "warning", "section": "skills", "message": "Only 1 skill listed — pages with 3+ skills look more complete"},
    {"severity": "warning", "section": "bio", "message": "Bio text is very short (under 20 words)"},
    {"severity": "error", "section": "hero", "message": "Missing tagline — hero section will look empty"}
  ],
  "publishable": true
}

KNOWN FACTS ABOUT THE USER:
- [identity/full-name]: {"full":"Luca Bianchi"}
- [skill/python]: {"name":"Python","level":"intermediate"}`;

describe.each(providers)("publish-incomplete [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("communicates preflight issues to the user", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: "Let's publish my page!" },
      ],
    });

    // Should mention at least some of the issues
    assertContainsAtLeast(
      text,
      ["skill", "bio", "tagline", "hero", "short", "incomplete", "missing", "issue", "warning"],
      2,
      "Should communicate preflight issues"
    );
  });

  it("offers to fix issues or publish anyway", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: "I want to publish now." },
      ],
    });

    // Should give the user a choice
    assertContainsAtLeast(
      text,
      ["fix", "add", "improve", "publish anyway", "go ahead", "your call", "up to you", "want to", "would you like"],
      1,
      "Should offer the user a choice"
    );
  });

  it("prioritizes errors over warnings in explanation", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: "Publish my page please." },
      ],
    });

    // Should mention the error (missing tagline) prominently
    assertContainsAtLeast(
      text,
      ["tagline", "hero", "missing"],
      1,
      "Should highlight the error-severity issue"
    );
  });
});
