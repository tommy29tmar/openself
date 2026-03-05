import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import type { PageConfig } from "@/lib/page-config/schema";

const SCOPE = {
  cognitiveOwnerKey: "profile-1",
  knowledgeReadKeys: ["session-anchor", "session-rotated"],
  knowledgePrimaryKey: "session-anchor",
  currentSessionId: "session-rotated",
};

const CANONICAL_CONFIG: PageConfig = {
  version: 1,
  username: "alice",
  theme: "minimal",
  style: {
    colorScheme: "light",
    primaryColor: "#111111",
    fontFamily: "sans-serif",
    layout: "centered",
  },
  sections: [
    { id: "hero-1", type: "hero", content: { name: "Alice", tagline: "Base" } },
    { id: "footer-1", type: "footer", content: {} },
  ],
};

const FIRST_PERSONALIZED: PageConfig = {
  ...CANONICAL_CONFIG,
  sections: [
    { id: "hero-1", type: "hero", content: { name: "Alice", tagline: "First personalized" } },
    { id: "footer-1", type: "footer", content: {} },
  ],
};

const SECOND_PERSONALIZED: PageConfig = {
  ...CANONICAL_CONFIG,
  sections: [
    { id: "hero-1", type: "hero", content: { name: "Alice", tagline: "Second personalized" } },
    { id: "footer-1", type: "footer", content: {} },
  ],
};

let mergeCallCount = 0;

const mockMergeActiveSectionCopy = vi.fn(() => {
  mergeCallCount += 1;
  return mergeCallCount === 1 ? FIRST_PERSONALIZED : SECOND_PERSONALIZED;
});

const mockComputeConfigHash = vi.fn((config: unknown) => JSON.stringify(config));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: () => SCOPE,
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: () => true,
}));

vi.mock("@/lib/services/page-service", () => ({
  getDraft: () => ({
    config: CANONICAL_CONFIG,
    username: "alice",
    status: "draft",
    configHash: null,
    updatedAt: null,
  }),
  computeConfigHash: (...args: unknown[]) => mockComputeConfigHash(...args),
}));

vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: () => [
    {
      id: "fact-1",
      sessionId: "session-anchor",
      profileId: "profile-1",
      category: "identity",
      key: "name",
      value: { full: "Alice" },
      visibility: "public",
      confidence: 1,
      source: "chat",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getPreferences: () => ({ language: "en", factLanguage: "en" }),
}));

vi.mock("@/lib/services/page-projection", () => ({
  projectCanonicalConfig: () => CANONICAL_CONFIG,
  publishableFromCanonical: (config: PageConfig) => config,
}));

vi.mock("@/lib/services/personalization-projection", () => ({
  mergeActiveSectionCopy: (...args: unknown[]) => mockMergeActiveSectionCopy(...args),
}));

const { GET } = await import("@/app/api/preview/stream/route");

describe("preview stream personalization invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mergeCallCount = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits a fresh optimistic_ready event when only personalized copy changes", async () => {
    const response = await GET(new Request("http://localhost/api/preview/stream"));
    expect(response.status).toBe(200);
    expect(response.body).toBeTruthy();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const first = await reader.read();
    const firstText = decoder.decode(first.value);
    expect(firstText).toContain('"status":"optimistic_ready"');
    expect(firstText).toContain("First personalized");

    const secondRead = reader.read();
    await vi.advanceTimersByTimeAsync(1000);
    const second = await secondRead;
    const secondText = decoder.decode(second.value);

    expect(secondText).toContain('"status":"optimistic_ready"');
    expect(secondText).toContain("Second personalized");
    expect(secondText).not.toContain('"status":"keepalive"');

    await reader.cancel();
  });
});
