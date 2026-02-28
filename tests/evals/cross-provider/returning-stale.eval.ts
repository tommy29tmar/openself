/**
 * Cross-provider eval: Returning user with stale page
 *
 * Scenario: User returns after 2 weeks. Agent knows them.
 * Expected: Personalized greeting with name, no questions about known info.
 *
 * LLM usage: Real conversation generation, no tool execution.
 * Hardcoded prompt: isolates returning-user behavior from pipeline changes.
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

const SYSTEM_PROMPT = `You are the OpenSelf agent — a warm AI that helps people build their personal web page.

MODE: ACTIVE (STALE PAGE)
You already know this person. They published their page 2+ weeks ago and are returning.
Language: Converse in English.

CRITICAL RULES:
- Use their name from facts. NEVER ask for their name again.
- Do NOT re-ask information already stored as facts.
- Suggest updates based on what might have changed.

KNOWN FACTS ABOUT THE USER (14 facts):
- [identity/full-name]: {"full":"Maria Rossi"}
- [identity/role]: {"role":"UX Designer"}
- [identity/location]: {"city":"Milan","country":"Italy"}
- [experience/design-studio]: {"role":"Senior UX Designer","company":"Design Studio Milano","start":"2022-03","end":null,"status":"current"}
- [experience/tech-corp]: {"role":"UX Designer","company":"TechCorp","start":"2019-06","end":"2022-02","status":"past"}
- [skill/figma]: {"name":"Figma","level":"expert"}
- [skill/user-research]: {"name":"User Research","level":"advanced"}
- [skill/prototyping]: {"name":"Prototyping","level":"advanced"}
- [interest/typography]: {"name":"Typography"}
- [interest/accessibility]: {"name":"Accessibility"}
- [project/design-system]: {"name":"Milan Design System","description":"Design system for Milan's digital services","status":"active","role":"Lead Designer"}
- [social/linkedin]: {"platform":"LinkedIn","url":"https://linkedin.com/in/mariarossi"}
- [education/polimi]: {"institution":"Politecnico di Milano","degree":"MSc","field":"Communication Design","period":"2017-2019"}`;

describe.each(providers)("returning-stale [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("greets the user by name", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: "Hey, I'm back!" },
      ],
    });

    // Should use the user's name
    assertContainsAtLeast(
      text,
      ["Maria"],
      1,
      "Should greet the user by name"
    );
  });

  it("does NOT ask for name or basic info", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: "Hey, I'm back!" },
      ],
    });

    // Should NOT ask questions about already-known information
    assertNoneOf(
      text,
      ["what's your name", "what do you do", "where are you from", "tell me about yourself", "who are you"],
      "Should not re-ask known information"
    );
  });

  it("references known information in the greeting", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: "Hey!" },
      ],
    });

    // Should reference at least one known fact
    assertContainsAtLeast(
      text,
      ["Maria", "design", "UX", "Milan", "Design Studio", "Figma", "typography"],
      1,
      "Should reference at least one known fact"
    );
  });

  it("asks about what's new (not re-interviewing)", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: "Hi again!" },
      ],
    });

    // Should ask about updates/changes, not start from scratch
    assertContainsAtLeast(
      text,
      ["new", "changed", "update", "lately", "recent", "what's been", "since", "happening"],
      1,
      "Should ask about what's new"
    );
  });
});
