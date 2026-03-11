import { describe, expect, it } from "vitest";

import {
  createUnbackedActionClaimTransform,
  getProposalFallback,
  hasSuccessfulMutationToolCall,
  hasSuccessfulProposalToolCall,
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

    expect(
      hasSuccessfulMutationToolCall([
        { toolName: "request_publish", success: true },
        { toolName: "propose_soul_change", success: true },
      ]),
    ).toBe(false);

    expect(
      hasSuccessfulMutationToolCall([
        { toolName: "review_soul_proposal", success: true, args: { accept: true } },
      ]),
    ).toBe(true);
  });

  it("detects risky Italian and English completion claims", () => {
    expect(looksLikeUnbackedActionClaim("Salvato. Ora lo vedi in anteprima.")).toBe(true);
    expect(looksLikeUnbackedActionClaim("I've updated it.")).toBe(true);
    expect(looksLikeUnbackedActionClaim("Ok, aggiunto.")).toBe(true);
    expect(looksLikeUnbackedActionClaim("Certo, updated.")).toBe(true);
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

    expect(
      sanitizeUnbackedActionClaim(
        "Ok, aggiunto.",
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

  it("stream transform still rewrites publish claims after request_publish because the page is not live yet", async () => {
    const output = await collect([
      { type: "tool-result", toolName: "request_publish", result: { success: true } },
      { type: "text-delta", textDelta: "Pubblicato. Ora e live." },
    ]);

    expect(output).toEqual([
      { type: "tool-result", toolName: "request_publish", result: { success: true } },
      { type: "text-delta", textDelta: "La pubblicazione è in attesa — usa il tasto di conferma per procedere." },
    ]);
  });

  it("hasSuccessfulProposalToolCall returns true for request_publish", () => {
    expect(hasSuccessfulProposalToolCall([
      { toolName: "request_publish", success: true },
    ])).toBe(true);
    expect(hasSuccessfulProposalToolCall([
      { toolName: "create_fact", success: true },
    ])).toBe(false);
    expect(hasSuccessfulProposalToolCall([
      { toolName: "request_publish", success: false },
    ])).toBe(false);
  });

  it("getProposalFallback returns tool-specific text for request_publish", () => {
    const itFallback = getProposalFallback("request_publish", "it");
    expect(itFallback).toContain("conferma");
    expect(itFallback).toContain("pubblicazione");
    const enFallback = getProposalFallback("request_publish", "en");
    expect(enFallback).toContain("confirmation");
    expect(enFallback).toContain("publish");
  });

  it("getProposalFallback returns tool-specific text for propose_soul_change", () => {
    const itFallback = getProposalFallback("propose_soul_change", "it");
    expect(itFallback).toContain("proposta");
    const enFallback = getProposalFallback("propose_soul_change", "en");
    expect(enFallback).toContain("proposal");
  });

  it("sanitizeUnbackedActionClaim uses proposal fallback when only proposal tools ran", () => {
    const result = sanitizeUnbackedActionClaim(
      "Pubblicato. Ora è live.",
      [{ toolName: "request_publish", success: true }],
      "it",
    );
    // Should NOT be the generic "Non l'ho ancora eseguito" — should be the proposal fallback
    expect(result).not.toBe("Non l'ho ancora eseguito. Se vuoi, lo faccio adesso.");
    expect(result).toContain("conferma");
    expect(result).toContain("pubblicazione");
  });

  it("stream transform uses proposal fallback after request_publish + action claim", async () => {
    const output = await collect([
      { type: "tool-result", toolName: "request_publish", result: { success: true } },
      { type: "text-delta", textDelta: "Pubblicato. Ora è live." },
    ]);

    const text = output.filter(p => p.type === "text-delta").map(p => (p as any).textDelta).join("");
    // Should be proposal-specific fallback, not the generic one
    expect(text).not.toBe("Non l'ho ancora eseguito. Se vuoi, lo faccio adesso.");
    expect(text).toContain("conferma");
  });

  it("sanitizeUnbackedActionClaim uses generic fallback when multiple proposal tools succeeded", () => {
    const result = sanitizeUnbackedActionClaim(
      "Ho aggiornato tutto e pubblicato.",
      [
        { toolName: "propose_soul_change", success: true },
        { toolName: "request_publish", success: true },
      ],
      "it",
    );
    // Multiple proposal tools → generic fallback, not tool-specific
    expect(result).toBe("Non l'ho ancora eseguito. Se vuoi, lo faccio adesso.");
  });

  it("sanitizeUnbackedActionClaim uses en proposal fallback for english", () => {
    const result = sanitizeUnbackedActionClaim(
      "Published! Your page is live.",
      [{ toolName: "request_publish", success: true }],
      "en",
    );
    expect(result).not.toBe("I haven't done that yet. If you want, I can do it now.");
    expect(result).toContain("confirmation");
    expect(result).toContain("publish");
  });
});
