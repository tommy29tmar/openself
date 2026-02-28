/**
 * Cross-provider eval: Translation quality
 *
 * Scenario: Italian page content → English translation.
 * Expected: Proper English output, proper nouns preserved.
 *
 * LLM usage: Direct generateText with translation prompt (SDK-level).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import { getTestProviders, setProvider, type TestProvider } from "./setup";

const providers = getTestProviders();

describe.each(providers)("translation [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("translates Italian bio section to English", async () => {
    const italianBio = "Maria è una designer UX con sede a Milano. Si occupa di progettazione di interfacce digitali e ricerca con gli utenti.";

    const { text } = await generateText({
      model: getModel(),
      system: "You are a translator. Translate the following Italian text to English. Output ONLY the translated text, nothing else.",
      prompt: italianBio,
    });

    expect(text.toLowerCase()).toContain("designer");
    expect(text.toLowerCase()).toMatch(/milan|milano/i);
    expect(text.toLowerCase()).toContain("ux");
    // Should NOT contain Italian function words
    expect(text.toLowerCase()).not.toContain(" è ");
    expect(text.toLowerCase()).not.toContain(" si occupa ");
  });

  it("preserves proper nouns during translation", async () => {
    const italianText = "Marco lavora presso Google a Roma. Ha studiato al Politecnico di Milano.";

    const { text } = await generateText({
      model: getModel(),
      system: "You are a translator. Translate the following Italian text to English. Output ONLY the translated text, nothing else. Preserve all proper nouns.",
      prompt: italianText,
    });

    expect(text).toContain("Marco");
    expect(text).toContain("Google");
    expect(text).toMatch(/Roma|Rome/);
    expect(text).toMatch(/Politecnico di Milano|Polytechnic University of Milan|Politecnico/);
  });

  it("translates skill names appropriately", async () => {
    const skillList = "Competenze: Progettazione grafica, Ricerca utenti, Prototipazione, TypeScript, React";

    const { text } = await generateText({
      model: getModel(),
      system: "You are a translator. Translate the following Italian text to English. Output ONLY the translated text, nothing else. Keep technical terms (TypeScript, React) unchanged.",
      prompt: skillList,
    });

    expect(text).toContain("TypeScript");
    expect(text).toContain("React");
    expect(text.toLowerCase()).not.toContain("progettazione grafica");
  });
});
