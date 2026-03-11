import { describe, it, expect } from "vitest";
import { validateRssUrl } from "@/lib/connectors/rss/url-validator";

describe("validateRssUrl", () => {
  it("accepts valid public HTTPS URLs", () => {
    expect(validateRssUrl("https://example.com/feed")).toEqual({ valid: true });
    expect(validateRssUrl("https://blog.example.com/rss.xml")).toEqual({ valid: true });
  });

  it("accepts HTTP URLs", () => {
    expect(validateRssUrl("http://example.com/feed")).toEqual({ valid: true });
  });

  it("rejects non-HTTP protocols", () => {
    expect(validateRssUrl("ftp://example.com/feed").valid).toBe(false);
    expect(validateRssUrl("file:///etc/passwd").valid).toBe(false);
    expect(validateRssUrl("javascript:alert(1)").valid).toBe(false);
  });

  it("rejects private/reserved IPs", () => {
    expect(validateRssUrl("http://127.0.0.1/feed").valid).toBe(false);
    expect(validateRssUrl("http://10.0.0.1/feed").valid).toBe(false);
    expect(validateRssUrl("http://192.168.1.1/feed").valid).toBe(false);
    expect(validateRssUrl("http://172.16.0.1/feed").valid).toBe(false);
    expect(validateRssUrl("http://169.254.169.254/feed").valid).toBe(false);
    expect(validateRssUrl("http://[::1]/feed").valid).toBe(false);
    expect(validateRssUrl("http://0.0.0.0/feed").valid).toBe(false);
  });

  it("rejects non-standard ports", () => {
    expect(validateRssUrl("https://example.com:8080/feed").valid).toBe(false);
    expect(validateRssUrl("https://example.com:3000/feed").valid).toBe(false);
  });

  it("rejects empty or malformed URLs", () => {
    expect(validateRssUrl("").valid).toBe(false);
    expect(validateRssUrl("not-a-url").valid).toBe(false);
  });
});
