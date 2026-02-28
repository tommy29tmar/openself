import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1", category: "identity", key: "name",
    value: { name: "Elena" }, visibility: "public" as const,
    confidence: 1, source: "agent" as const,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("website in hero socialLinks", () => {
  it("includes website-type contact fact in hero socialLinks", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "contact", key: "web", value: { type: "website", value: "elenarossi.design" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const hero = page.sections.find((s) => s.type === "hero");
    const socialLinks = (hero!.content as { socialLinks?: { platform: string; url: string }[] }).socialLinks;
    expect(socialLinks).toBeDefined();
    const websiteLink = socialLinks!.find((l) => l.platform === "website");
    expect(websiteLink).toBeDefined();
    expect(websiteLink!.url).toContain("elenarossi.design");
    expect((websiteLink as any).label).toBe("Website");
  });

  it("prepends https:// if missing", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena" } }),
      makeFact({ category: "contact", key: "web", value: { type: "website", value: "example.com" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const hero = page.sections.find((s) => s.type === "hero");
    const socialLinks = (hero!.content as { socialLinks?: { platform: string; url: string }[] }).socialLinks;
    expect(socialLinks![0].url).toBe("https://example.com");
  });
});
