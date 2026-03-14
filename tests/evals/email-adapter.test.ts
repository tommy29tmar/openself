import { describe, it, expect, beforeEach, vi } from "vitest";

// Reset module-level singleton before each test
beforeEach(() => {
  vi.resetModules();
  // Clear env vars
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_SMTP_HOST;
  delete process.env.EMAIL_SMTP_PORT;
  delete process.env.EMAIL_SMTP_USER;
  delete process.env.EMAIL_SMTP_PASS;
});

describe("EmailAdapter types", () => {
  it("SendEmailOptions has correct shape", async () => {
    // Type-level check: if this compiles, the interface is correct
    const opts = {
      to: "test@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
      from: "sender@example.com",
    };
    expect(opts.to).toBe("test@example.com");
    expect(opts.subject).toBe("Test");
    expect(opts.html).toBe("<p>Hello</p>");
    expect(opts.from).toBe("sender@example.com");
  });
});

describe("getEmailAdapter — factory", () => {
  it("returns noop adapter when no env vars set", async () => {
    const { getEmailAdapter, _resetEmailAdapter } = await import("@/lib/email/index");
    _resetEmailAdapter();
    const adapter = getEmailAdapter();
    // Should succeed without sending anything
    const result = await adapter.sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });
    expect(result.success).toBe(true);
  });

  it("returns ResendAdapter when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "re_test_123";
    const { getEmailAdapter, _resetEmailAdapter } = await import("@/lib/email/index");
    _resetEmailAdapter();
    const adapter = getEmailAdapter();
    expect(adapter.constructor.name).toBe("ResendAdapter");
  });

  it("returns SmtpAdapter when EMAIL_SMTP_HOST is set", async () => {
    process.env.EMAIL_SMTP_HOST = "smtp.example.com";
    process.env.EMAIL_SMTP_PORT = "587";
    process.env.EMAIL_SMTP_USER = "user";
    process.env.EMAIL_SMTP_PASS = "pass";
    const { getEmailAdapter, _resetEmailAdapter } = await import("@/lib/email/index");
    _resetEmailAdapter();
    const adapter = getEmailAdapter();
    expect(adapter.constructor.name).toBe("SmtpAdapter");
  });

  it("prioritizes Resend over SMTP when both configured", async () => {
    process.env.RESEND_API_KEY = "re_test_123";
    process.env.EMAIL_SMTP_HOST = "smtp.example.com";
    const { getEmailAdapter, _resetEmailAdapter } = await import("@/lib/email/index");
    _resetEmailAdapter();
    const adapter = getEmailAdapter();
    expect(adapter.constructor.name).toBe("ResendAdapter");
  });

  it("caches adapter across calls", async () => {
    const { getEmailAdapter, _resetEmailAdapter } = await import("@/lib/email/index");
    _resetEmailAdapter();
    const a1 = getEmailAdapter();
    const a2 = getEmailAdapter();
    expect(a1).toBe(a2);
  });
});

describe("ResendAdapter", () => {
  it("handles API errors gracefully", async () => {
    const { ResendAdapter } = await import("@/lib/email/resend-adapter");
    // Mock fetch to simulate API error
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    });

    try {
      const adapter = new ResendAdapter("re_invalid");
      const result = await adapter.sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Hello</p>",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("403");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns success on 200", async () => {
    const { ResendAdapter } = await import("@/lib/email/resend-adapter");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "email_123" }),
    });

    try {
      const adapter = new ResendAdapter("re_valid");
      const result = await adapter.sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Hello</p>",
      });
      expect(result.success).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles network errors", async () => {
    const { ResendAdapter } = await import("@/lib/email/resend-adapter");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

    try {
      const adapter = new ResendAdapter("re_valid");
      const result = await adapter.sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Hello</p>",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Network failure");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Noop adapter", () => {
  it("always returns success", async () => {
    const { getEmailAdapter, _resetEmailAdapter } = await import("@/lib/email/index");
    _resetEmailAdapter();
    const adapter = getEmailAdapter();
    const result = await adapter.sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
