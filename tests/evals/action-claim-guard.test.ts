import { describe, expect, it } from "vitest";

import {
  createUnbackedActionClaimTransform,
  hasSuccessfulMutationToolCall,
  looksLikeUnbackedActionClaim,
  sanitizeUnbackedActionClaim,
} from "@/lib/agent/action-claim-guard";

type StreamPart = { type: string; [key: string]: unknown };

async function collect(parts: StreamPart[], language = "it"): Promise<StreamPart[]> {
  const stream = new ReadableStream<StreamPart>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  }).pipeThrough(createUnbackedActionClaimTransform(language)());

  const reader = stream.getReader();
  const output: StreamPart[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    output.push(value);
  }

  return output;
}

describe("action claim guard", () => {
  it("treats mutating tools as write-backed and read-only tools as non-mutating", () => {
    expect(
      hasSuccessfulMutationToolCall([
        { toolName: "search_facts", success: true },
        { toolName: "publish_preflight", success: true },
      ]),
    ).toBe(false);

    expect(
      hasSuccessfulMutationToolCall([
        { toolName: "search_facts", success: true },
        { toolName: "create_fact", success: true },
      ]),
    ).toBe(true);
  });

  it("detects risky Italian and English completion claims", () => {
    expect(looksLikeUnbackedActionClaim("Salvato. Ora lo vedi in anteprima.")).toBe(true);
    expect(looksLikeUnbackedActionClaim("I've updated it.")).toBe(true);
    expect(looksLikeUnbackedActionClaim("Lo controllo e poi ti dico.")).toBe(false);
  });

  it("sanitizes unbacked completion claims when no write tool ran", () => {
    expect(
      sanitizeUnbackedActionClaim(
        "Salvato. Ora lo vedi in anteprima.",
        [{ toolName: "search_facts", success: true }],
        "it",
      ),
    ).toBe("Non l'ho ancora eseguito. Se vuoi, lo faccio adesso.");
  });

  it("keeps the original text when a write tool succeeded", () => {
    expect(
      sanitizeUnbackedActionClaim(
        "Updated. Check the preview.",
        [{ toolName: "generate_page", success: true }],
        "en",
      ),
    ).toBe("Updated. Check the preview.");
  });

  it("stream transform rewrites risky standalone claims without a mutating tool result", async () => {
    const output = await collect([
      { type: "text-delta", textDelta: "Salvato. Ora lo vedi in anteprima." },
    ]);

    expect(output).toEqual([
      { type: "text-delta", textDelta: "Non l'ho ancora eseguito. Se vuoi, lo faccio adesso." },
    ]);
  });

  it("stream transform preserves risky text after a successful mutating tool result", async () => {
    const output = await collect([
      { type: "tool-result", toolName: "create_fact", result: { success: true } },
      { type: "text-delta", textDelta: "Salvato. Ora lo vedi in anteprima." },
    ]);

    expect(output).toEqual([
      { type: "tool-result", toolName: "create_fact", result: { success: true } },
      { type: "text-delta", textDelta: "Salvato. Ora lo vedi in anteprima." },
    ]);
  });
});
