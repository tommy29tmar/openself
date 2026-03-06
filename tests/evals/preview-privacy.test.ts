import { describe, it, expect, vi } from "vitest";
import {
  filterPublishableFacts,
  projectPublishableConfig,
} from "@/lib/services/page-projection";
import { computeConfigHash } from "@/lib/services/page-service";
import type { FactRow } from "@/lib/services/kb-service";
import type { PageConfig, Section } from "@/lib/page-config/schema";

// Mock the composer to produce sections from facts
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(
    (facts: FactRow[], username: string) => ({
      version: 1,
      username,
      surface: "canvas",
      voice: "signal",
      light: "day",
      style: {
        primaryColor: "#000",
        layout: "centered",
      },
      sections: [
        { id: "hero-1", type: "hero", content: { name: username, tagline: "Hello" } },
        ...facts.map((f, i) => ({
          id: `s-${i}`,
          type: "skills" as const,
          content: { groups: [{ label: f.category, skills: [f.key] }] },
        })),
        { id: "footer-1", type: "footer", content: {} },
      ],
    }),
  ),
}));

function makeFact(overrides: Partial<FactRow> & { category: string; key: string }): FactRow {
  return {
    id: `f-${overrides.key}`,
    sessionId: "sess1",
    profileId: "sess1",
    value: { name: "test" },
    visibility: "proposed" as const,
    confidence: 1.0,
    source: "chat",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as FactRow;
}

describe("Preview privacy — projectPublishableConfig", () => {
  it("never includes private facts in output config", () => {
    const facts = [
      makeFact({ category: "skill", key: "js", visibility: "public" }),
      makeFact({ category: "skill", key: "secret-skill", visibility: "private" }),
      makeFact({ category: "identity", key: "full-name", visibility: "private" }),
    ];
    const config = projectPublishableConfig(facts, "alice", "en");

    // Only 1 public fact → 1 skill section + hero + footer
    expect(config.sections).toHaveLength(3); // hero + 1 skill + footer

    // Verify no private fact content in any section
    const sectionJson = JSON.stringify(config.sections);
    expect(sectionJson).not.toContain("secret-skill");
    expect(sectionJson).not.toContain("full-name");
  });

  it("never includes sensitive category facts even if public", () => {
    const facts = [
      makeFact({ category: "skill", key: "js", visibility: "public" }),
      makeFact({ category: "contact", key: "email", visibility: "public", value: { type: "email", value: "me@example.com" } }),
      makeFact({ category: "compensation", key: "salary", visibility: "public" }),
      makeFact({ category: "health", key: "condition", visibility: "proposed" }),
    ];
    const config = projectPublishableConfig(facts, "alice", "en");

    const sectionJson = JSON.stringify(config.sections);
    // contact is user-controlled (not sensitive) — should appear in published page
    expect(sectionJson).toContain("email");
    // truly sensitive categories are still stripped
    expect(sectionJson).not.toContain("salary");
    expect(sectionJson).not.toContain("condition");
    expect(sectionJson).toContain("js");
  });

  it("legacy draft with baked-in private data is overridden by projection", () => {
    // Simulate: draftMeta has sections from a legacy draft that included private data
    // But projectPublishableConfig ALWAYS recomposes from filtered facts
    const facts = [
      makeFact({ category: "skill", key: "public-skill", visibility: "public" }),
      makeFact({ category: "identity", key: "private-name", visibility: "private" }),
    ];

    const legacyDraftMeta = {
      surface: "clay",
      voice: "signal",
      light: "day",
      style: {
        primaryColor: "#000",
        layout: "centered" as const,
      },
      sections: [
        // Legacy section that contained private data — should NOT leak
        {
          id: "s-legacy",
          type: "bio" as const,
          content: { text: "Secret bio with private-name info" },
        },
      ] as Section[],
    };

    const config = projectPublishableConfig(facts, "alice", "en", legacyDraftMeta);

    // Sections are recomposed from facts, not from draft.config
    // The legacy "s-legacy" bio section should NOT appear because it came from
    // draft metadata — only the section order is preserved, not content
    const sectionTypes = config.sections.map((s) => s.type);
    expect(sectionTypes).toContain("hero");
    expect(sectionTypes).toContain("footer");

    // The content should NOT contain the legacy bio text
    const sectionJson = JSON.stringify(config.sections);
    expect(sectionJson).not.toContain("Secret bio");
  });

  it("configHash from projection is deterministic", () => {
    const facts = [
      makeFact({ category: "skill", key: "js", visibility: "public" }),
    ];

    const config1 = projectPublishableConfig(facts, "alice", "en");
    const config2 = projectPublishableConfig(facts, "alice", "en");

    expect(computeConfigHash(config1)).toBe(computeConfigHash(config2));
  });

  it("preview and publish use same projection → same hash", () => {
    const facts = [
      makeFact({ category: "skill", key: "js", visibility: "public" }),
      makeFact({ category: "project", key: "app", visibility: "proposed" }),
    ];

    // Both paths call projectPublishableConfig with same inputs
    const previewConfig = projectPublishableConfig(facts, "alice", "en");
    const publishConfig = projectPublishableConfig(facts, "alice", "en");

    expect(computeConfigHash(previewConfig)).toBe(computeConfigHash(publishConfig));
  });

  it("visibility change from private→proposed changes the hash", () => {
    const factsV1 = [
      makeFact({ category: "skill", key: "js", visibility: "private" }),
    ];
    const factsV2 = [
      makeFact({ category: "skill", key: "js", visibility: "proposed" }),
    ];

    const hash1 = computeConfigHash(projectPublishableConfig(factsV1, "alice", "en"));
    const hash2 = computeConfigHash(projectPublishableConfig(factsV2, "alice", "en"));

    expect(hash1).not.toBe(hash2);
  });
});
