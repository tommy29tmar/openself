import { describe, it, expect } from "vitest";

/**
 * Tests the greeting validation logic used in the chat route.
 * The validation is inlined in route.ts — we replicate it here to verify
 * edge cases without needing the full route handler dependencies.
 */
function validateGreetingMessage(
  raw: unknown,
): { id: string; content: string } | undefined {
  const g = raw as { id: string; content: string } | undefined;
  return g &&
    typeof g.id === "string" &&
    g.id.startsWith("greeting-") &&
    g.id.length <= 30 &&
    typeof g.content === "string" &&
    g.content.length > 0 &&
    g.content.length <= 500
    ? g
    : undefined;
}

describe("greeting message validation", () => {
  it("accepts valid greeting message", () => {
    const result = validateGreetingMessage({
      id: "greeting-1741862400000",
      content: "Ciao! Come ti chiami?",
    });
    expect(result).toBeDefined();
    expect(result!.id).toBe("greeting-1741862400000");
    expect(result!.content).toBe("Ciao! Come ti chiami?");
  });

  it("rejects missing id", () => {
    expect(validateGreetingMessage({ content: "hi" })).toBeUndefined();
  });

  it("rejects id without greeting- prefix", () => {
    expect(
      validateGreetingMessage({ id: "msg-12345", content: "hi" }),
    ).toBeUndefined();
  });

  it("rejects id exceeding 30 chars", () => {
    expect(
      validateGreetingMessage({
        id: "greeting-" + "x".repeat(30),
        content: "hi",
      }),
    ).toBeUndefined();
  });

  it("rejects empty content", () => {
    expect(
      validateGreetingMessage({ id: "greeting-123", content: "" }),
    ).toBeUndefined();
  });

  it("rejects content exceeding 500 chars", () => {
    expect(
      validateGreetingMessage({
        id: "greeting-123",
        content: "x".repeat(501),
      }),
    ).toBeUndefined();
  });

  it("rejects undefined/null input", () => {
    expect(validateGreetingMessage(undefined)).toBeUndefined();
    expect(validateGreetingMessage(null)).toBeUndefined();
  });

  it("rejects non-string id", () => {
    expect(
      validateGreetingMessage({ id: 12345, content: "hi" }),
    ).toBeUndefined();
  });

  it("rejects non-string content", () => {
    expect(
      validateGreetingMessage({ id: "greeting-123", content: 42 }),
    ).toBeUndefined();
  });

  it("accepts content at max length (500 chars)", () => {
    const result = validateGreetingMessage({
      id: "greeting-123",
      content: "x".repeat(500),
    });
    expect(result).toBeDefined();
  });

  it("accepts id at max length (30 chars)", () => {
    // "greeting-" is 9 chars, so 21 more chars to reach 30
    const result = validateGreetingMessage({
      id: "greeting-" + "1".repeat(21),
      content: "hi",
    });
    expect(result).toBeDefined();
    expect(result!.id.length).toBe(30);
  });
});
