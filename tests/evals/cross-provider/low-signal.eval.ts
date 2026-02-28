/**
 * Cross-provider eval: Low-signal user handling
 *
 * Scenario: User gives vague, minimal responses.
 * Expected: Agent escalates through guided prompts -> fill-in-blank -> minimal page fallback.
 *
 * LLM usage: Real conversation generation, no tool execution.
 * Hardcoded prompt: isolates low-signal handling from pipeline changes.
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

MODE: ONBOARDING
Language: English.

Low-signal handling:
Step 1 — After 2+ low-signal replies: Switch to guided prompts with 3-4 short selectable options (chips).
Step 2 — If guided prompts still get minimal response: Try fill-in-the-blank sentence starters.
Step 3 — After 3 total guided/fill-in attempts: Build a minimal page with whatever you have.

NEVER respond with generic "let me know if you need anything" during onboarding.`;

describe.each(providers)("low-signal [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("presents guided options after 2 low-signal replies", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "Hey! Nice to meet you. I'd love to learn about you so I can build your personal page. What do you do?" },
        { role: "user", content: "stuff" },
        { role: "assistant", content: "No worries! Tell me a bit about yourself — what are you working on these days, or what are you into?" },
        { role: "user", content: "idk" },
      ],
    });

    // After 2+ low-signal replies, should switch to guided options
    assertContainsAtLeast(
      text,
      ["job", "project", "hobby", "interest", "proud", "work", "skill", "built", "pick", "choose", "start with"],
      2,
      "Should present guided selectable options"
    );
  });

  it("proposes minimal page after persistent low signal", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT + "\n\nKNOWN FACTS:\n- [identity/full-name]: {\"full\":\"Sam\"}",
      messages: [
        { role: "user", content: "hi im sam" },
        { role: "assistant", content: "Hey Sam! Let's build your page. Pick one to start: [My job] [A project] [Hobbies] [Something I'm proud of]" },
        { role: "user", content: "meh" },
        { role: "assistant", content: "No problem! Try this: \"People usually come to me when they need help with ___\"" },
        { role: "user", content: "ok" },
        { role: "assistant", content: "Alright, one more try: \"The thing I spend most time on is ___\"" },
        { role: "user", content: "dunno" },
      ],
    });

    // After 3 guided attempts, should propose building a minimal page
    assertContainsAtLeast(
      text,
      ["enough", "started", "simple", "page", "build", "minimal", "basic", "come back", "add more", "later"],
      2,
      "Should propose building a minimal page"
    );
  });

  it("never ends with passive closing during onboarding", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: "ok" },
      ],
    });

    // Should NOT end with a passive closing
    const lastSentence = text.trim().split(/[.!?]/).filter(Boolean).pop()?.toLowerCase() ?? "";
    expect(lastSentence).not.toMatch(/let me know if you need anything/i);
    expect(lastSentence).not.toMatch(/feel free to ask/i);
  });
});
