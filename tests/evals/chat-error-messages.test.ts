import { describe, it, expect } from "vitest";
import { chatFriendlyError, parseChatErrorJson } from "@/lib/i18n/error-messages";

describe("parseChatErrorJson", () => {
  it("parses valid JSON with code and UUID requestId", () => {
    const result = parseChatErrorJson('{"code":"AI_TIMEOUT","requestId":"a1b2c3d4-e5f6-7890-abcd-ef1234567890"}');
    expect(result).toEqual({ code: "AI_TIMEOUT", requestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
  });

  it("strips non-UUID requestId for security", () => {
    const result = parseChatErrorJson('{"code":"AI_TIMEOUT","requestId":"Call +1-800-EVIL"}');
    expect(result).toEqual({ code: "AI_TIMEOUT", requestId: undefined });
  });

  it("returns null for non-JSON strings", () => {
    expect(parseChatErrorJson("fetch failed")).toBeNull();
  });

  it("returns null for JSON without code field", () => {
    expect(parseChatErrorJson('{"error":"something"}')).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseChatErrorJson("")).toBeNull();
  });
});

describe("chatFriendlyError", () => {
  it("maps AI_PROVIDER_UNAVAILABLE to localized message (en)", () => {
    const msg = chatFriendlyError("AI_PROVIDER_UNAVAILABLE", "en");
    expect(msg).toContain("temporarily unavailable");
  });

  it("maps AI_RATE_LIMITED to localized message (it)", () => {
    const msg = chatFriendlyError("AI_RATE_LIMITED", "it");
    expect(msg).toContain("Troppe richieste");
  });

  it("maps AI_TIMEOUT to localized message (en)", () => {
    const msg = chatFriendlyError("AI_TIMEOUT", "en");
    expect(msg).toContain("too long");
  });

  it("maps BUDGET_EXCEEDED to localized message (en)", () => {
    const msg = chatFriendlyError("BUDGET_EXCEEDED", "en");
    expect(msg).toContain("usage limit");
  });

  it("maps MODEL_NOT_CONFIGURED to localized message (en)", () => {
    const msg = chatFriendlyError("MODEL_NOT_CONFIGURED", "en");
    expect(msg).toContain("check your setup");
  });

  it("maps CONTEXT_TOO_LONG to localized message (en)", () => {
    const msg = chatFriendlyError("CONTEXT_TOO_LONG", "en");
    expect(msg).toContain("too long");
  });

  it("maps CONTENT_FILTERED to localized message (en)", () => {
    const msg = chatFriendlyError("CONTENT_FILTERED", "en");
    expect(msg).toContain("rephrasing");
  });

  it("returns generic for unknown code", () => {
    const msg = chatFriendlyError("UNKNOWN_CODE", "en");
    expect(msg).toContain("went wrong");
  });

  it("returns generic for null code", () => {
    const msg = chatFriendlyError(null, "en");
    expect(msg).toContain("went wrong");
  });

  it("appends requestId to generic errors", () => {
    const msg = chatFriendlyError("CHAT_INTERNAL_ERROR", "en", "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(msg).toContain("Ref: a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });

  it("does not append requestId to specific errors", () => {
    const msg = chatFriendlyError("AI_TIMEOUT", "en", "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(msg).not.toContain("Ref:");
  });

  it("appends requestId for AI_NO_CONTENT (falls through to generic)", () => {
    const msg = chatFriendlyError("AI_NO_CONTENT", "en", "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(msg).toContain("went wrong");
    expect(msg).toContain("Ref:");
  });

  it("falls back to en for unsupported language", () => {
    const msg = chatFriendlyError("AI_TIMEOUT", "xx");
    expect(msg).toContain("too long");
  });
});
