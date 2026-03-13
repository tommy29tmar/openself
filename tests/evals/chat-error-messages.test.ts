import { describe, it, expect } from "vitest";
import { chatFriendlyError, parseChatErrorJson } from "@/lib/i18n/error-messages";

describe("parseChatErrorJson", () => {
  it("parses valid JSON with code and requestId", () => {
    const result = parseChatErrorJson('{"code":"AI_TIMEOUT","requestId":"abc-123"}');
    expect(result).toEqual({ code: "AI_TIMEOUT", requestId: "abc-123" });
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
    const msg = chatFriendlyError("CHAT_INTERNAL_ERROR", "en", "req-abc");
    expect(msg).toContain("Ref: req-abc");
  });

  it("does not append requestId to specific errors", () => {
    const msg = chatFriendlyError("AI_TIMEOUT", "en", "req-abc");
    expect(msg).not.toContain("Ref:");
  });

  it("falls back to en for unsupported language", () => {
    const msg = chatFriendlyError("AI_TIMEOUT", "xx");
    expect(msg).toContain("too long");
  });
});
