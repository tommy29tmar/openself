/**
 * Cross-provider eval: Undo request handling
 *
 * Scenario: User expresses dissatisfaction after a theme change.
 * Expected: Agent identifies the change, proposes reversal, does NOT regenerate entire page.
 *
 * LLM usage: Real conversation generation, no tool execution.
 * Hardcoded prompt: isolates undo behavior from pipeline changes.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import {
  getTestProviders,
  setProvider,
  assertContainsAtLeast,
  assertNoneOf,
  type TestProvider,
} from "./setup";

const providers = getTestProviders();

const SYSTEM_PROMPT = `You are the OpenSelf agent — a warm, thoughtful AI that helps people build their personal web page.

UNDO AND REVERSAL HANDLING:
When the user expresses dissatisfaction or wants to undo:
1. IDENTIFY the last action (check recent tool calls)
2. EXPLAIN what was done
3. PROPOSE reversal + alternatives
4. ACT on user's decision

NEVER regenerate the entire page as first reaction.
If complaint is vague, ask what specifically isn't working.

Available themes: minimal, warm, editorial-360.
The page currently uses the "warm" theme (just changed from "minimal").`;

describe.each(providers)("undo-request [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("identifies last action when user says 'don't like it'", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: [
        { role: "assistant", content: "I've switched your theme to warm — check out the preview!" },
        { role: "user", content: "Hmm, I don't like it. It was better before." },
      ],
    });

    // Should reference the theme change
    assertContainsAtLeast(
      text,
      ["theme", "warm", "minimal", "switch", "change", "back"],
      2,
      "Should identify and reference the theme change"
    );
  });

  it("proposes reversal instead of regenerating page", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: [
        { role: "assistant", content: "I've switched your theme to warm — check out the preview!" },
        { role: "user", content: "No, go back. I preferred the other one." },
      ],
    });

    // Should propose going back to minimal
    assertContainsAtLeast(
      text,
      ["minimal", "back", "switch", "revert", "previous", "before"],
      2,
      "Should propose reverting to previous theme"
    );

    // Should NOT propose regenerating the entire page
    assertNoneOf(
      text,
      ["regenerate the entire page", "rebuild your whole page", "generate everything from scratch"],
      "Should not propose full page regeneration"
    );
  });

  it("asks for specifics when complaint is vague", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: "I don't like how my page looks." },
      ],
    });

    // Should ask what specifically isn't working
    assertContainsAtLeast(
      text,
      ["what", "which", "specific", "part", "layout", "theme", "color", "text", "change"],
      2,
      "Should ask what specifically the user dislikes"
    );
  });

  it("handles Italian undo phrases", async () => {
    const italianPrompt = SYSTEM_PROMPT.replace(
      "You are the OpenSelf agent",
      "You are the OpenSelf agent. Converse in Italian"
    );

    const { text } = await generateText({
      model: getModel(),
      system: italianPrompt,
      messages: [
        { role: "assistant", content: "Ho cambiato il tema in warm — dai un'occhiata all'anteprima!" },
        { role: "user", content: "Non mi piace, torna come prima." },
      ],
    });

    // Should respond in Italian and propose reversal
    expect(text.length).toBeGreaterThan(10);
    // Should reference the theme or the previous state
    assertContainsAtLeast(
      text,
      ["tema", "minimal", "warm", "prima", "precedente", "tornare", "ripristino", "cambi"],
      1,
      "Should reference the change in Italian"
    );
  });
});
