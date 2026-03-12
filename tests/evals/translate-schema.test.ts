import { describe, it, expect } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";

describe("TranslationResultSchema", () => {
  it("has type 'object' at top level for Anthropic compatibility", async () => {
    const { TranslationResultSchema } = await import("@/lib/ai/translate");
    const jsonSchema = zodToJsonSchema(TranslationResultSchema);
    expect((jsonSchema as Record<string, unknown>).type).toBe("object");
  });
});
