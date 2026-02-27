import { describe, it, expect } from "vitest";
import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: overrides.id ?? `fact-${Math.random().toString(36).slice(2, 8)}`,
    category: overrides.category as string,
    key: overrides.key as string,
    value: overrides.value ?? {},
    source: "chat",
    confidence: 1.0,
    visibility: (overrides.visibility as string) ?? "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("Hero ContactBar integration", () => {
  it("should include socialLinks, contactEmail, and languages in hero content", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice Smith" } }),
      makeFact({ category: "social", key: "github", value: { platform: "GitHub", url: "https://github.com/alice" } }),
      makeFact({ category: "social", key: "linkedin", value: { platform: "LinkedIn", url: "https://linkedin.com/in/alice" } }),
      makeFact({ category: "contact", key: "email", value: { type: "email", email: "alice@example.com" } }),
      makeFact({ category: "language", key: "english", value: { language: "English", proficiency: "native" } }),
      makeFact({ category: "language", key: "french", value: { language: "French", proficiency: "fluent" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const hero = config.sections.find((s) => s.type === "hero");
    expect(hero).toBeDefined();
    const content = hero!.content as Record<string, unknown>;
    expect(content.socialLinks).toHaveLength(2);
    expect(content.contactEmail).toBe("alice@example.com");
    expect(content.languages).toHaveLength(2);
  });

  it("should NOT generate standalone social, contact, languages sections when EXTENDED_SECTIONS=true", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({ category: "social", key: "github", value: { platform: "GitHub", url: "https://github.com/alice" } }),
      makeFact({ category: "contact", key: "email", value: { type: "email", email: "alice@example.com" } }),
      makeFact({ category: "language", key: "en", value: { language: "English", proficiency: "native" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const types = config.sections.map((s) => s.type);
    expect(types).not.toContain("social");
    expect(types).not.toContain("contact");
    expect(types).not.toContain("languages");
  });

  it("should gracefully handle missing social/contact/language facts", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const hero = config.sections.find((s) => s.type === "hero");
    const content = hero!.content as Record<string, unknown>;
    expect(content.socialLinks).toBeUndefined();
    expect(content.contactEmail).toBeUndefined();
    expect(content.languages).toBeUndefined();
  });

  it("should prefer public email over proposed when multiple contacts exist", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({
        category: "contact", key: "email-reg",
        value: { type: "email", email: "alice@registration.com" },
        visibility: "proposed",
      }),
      makeFact({
        category: "contact", key: "email-work",
        value: { type: "email", email: "alice@company.com" },
        visibility: "public",
      }),
      makeFact({
        category: "contact", key: "email-personal",
        value: { type: "email", email: "alice@gmail.com" },
        visibility: "private",
      }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const hero = config.sections.find((s) => s.type === "hero");
    const content = hero!.content as Record<string, unknown>;
    // Public email takes priority over proposed; private is filtered upstream
    expect(content.contactEmail).toBe("alice@company.com");
  });

  it("should show proposed email when no public email exists", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({
        category: "contact", key: "email-reg",
        value: { type: "email", email: "alice@registration.com" },
        visibility: "proposed",
      }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const hero = config.sections.find((s) => s.type === "hero");
    const content = hero!.content as Record<string, unknown>;
    expect(content.contactEmail).toBe("alice@registration.com");
  });
});
