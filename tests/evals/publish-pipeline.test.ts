import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  db: {},
  sqlite: { transaction: vi.fn((fn: () => void) => fn) },
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  getAllFacts: vi.fn(),
}));

vi.mock("@/lib/services/page-service", () => ({
  getDraft: vi.fn(),
  upsertDraft: vi.fn(),
  requestPublish: vi.fn(),
  confirmPublish: vi.fn(),
  computeConfigHash: vi.fn(() => "hash-abc123"),
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getPreferences: vi.fn(() => ({ language: "en", factLanguage: "en" })),
}));

vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(() => ({
    version: 1,
    username: "testuser",
    theme: "minimal",
    style: { colorScheme: "light", primaryColor: "#6366f1", fontFamily: "inter", layout: "centered" },
    sections: [
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test", tagline: "Hello" } },
      { id: "bio-1", type: "bio", variant: "full", content: { text: "Bio text." } },
      { id: "footer-1", type: "footer", content: {} },
    ],
  })),
}));

vi.mock("@/lib/ai/translate", () => ({
  translatePageContent: vi.fn(async (config: any) => config),
}));

import { prepareAndPublish, PublishError } from "@/lib/services/publish-pipeline";
import { getAllFacts } from "@/lib/services/kb-service";
import {
  getDraft,
  upsertDraft,
  requestPublish,
  confirmPublish,
} from "@/lib/services/page-service";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import type { PageConfig } from "@/lib/page-config/schema";

function makeConfig(overrides?: Partial<PageConfig>): PageConfig {
  return {
    version: 1,
    username: "testuser",
    theme: "minimal",
    style: { colorScheme: "light", primaryColor: "#6366f1", fontFamily: "inter", layout: "centered" },
    sections: [
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test", tagline: "Hello" } },
      { id: "footer-1", type: "footer", content: {} },
    ],
    ...overrides,
  };
}

function makeFact(overrides: { category: string; key: string; updatedAt?: string }) {
  return {
    id: "fact-" + Math.random().toString(36).slice(2, 8),
    category: overrides.category,
    key: overrides.key,
    value: { name: "test" },
    source: "chat",
    confidence: 1.0,
    visibility: "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("prepareAndPublish", () => {
  it("throws NO_FACTS when facts are empty", async () => {
    vi.mocked(getAllFacts).mockReturnValue([]);

    await expect(
      prepareAndPublish("testuser", "session-1", { mode: "register" }),
    ).rejects.toThrow(PublishError);

    try {
      await prepareAndPublish("testuser", "session-1", { mode: "register" });
    } catch (e) {
      expect(e).toBeInstanceOf(PublishError);
      expect((e as PublishError).code).toBe("NO_FACTS");
      expect((e as PublishError).httpStatus).toBe(400);
    }
  });

  it("publishes draft as-is when draft is up to date", async () => {
    const facts = [makeFact({ category: "identity", key: "name", updatedAt: "2026-01-01T10:00:00Z" })];
    vi.mocked(getAllFacts).mockReturnValue(facts as any);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig(),
      username: "testuser",
      status: "draft",
      configHash: "hash-abc",
      updatedAt: "2026-01-01T12:00:00Z", // draft newer than facts
    });

    const result = await prepareAndPublish("testuser", "session-1", { mode: "publish" });

    expect(result.success).toBe(true);
    expect(result.regenerated).toBe(false);
    expect(upsertDraft).not.toHaveBeenCalled();
    expect(requestPublish).toHaveBeenCalledWith("testuser", "session-1");
    expect(confirmPublish).toHaveBeenCalledWith("testuser", "session-1");
  });

  it("register mode: auto-regenerates when facts are newer than draft", async () => {
    const facts = [
      makeFact({ category: "identity", key: "name", updatedAt: "2026-01-01T14:00:00Z" }),
      makeFact({ category: "skill", key: "ts", updatedAt: "2026-01-01T14:00:00Z" }),
    ];
    vi.mocked(getAllFacts).mockReturnValue(facts as any);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig(),
      username: "testuser",
      status: "draft",
      configHash: "hash-old",
      updatedAt: "2026-01-01T12:00:00Z", // draft older than facts
    });

    const result = await prepareAndPublish("testuser", "session-1", { mode: "register" });

    expect(result.success).toBe(true);
    expect(result.regenerated).toBe(true);
    expect(composeOptimisticPage).toHaveBeenCalled();
    expect(upsertDraft).toHaveBeenCalled();
  });

  it("publish mode: rejects with STALE_DRAFT when facts are newer than draft", async () => {
    const facts = [
      makeFact({ category: "identity", key: "name", updatedAt: "2026-01-01T14:00:00Z" }),
    ];
    vi.mocked(getAllFacts).mockReturnValue(facts as any);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig(),
      username: "testuser",
      status: "draft",
      configHash: "hash-old",
      updatedAt: "2026-01-01T12:00:00Z",
    });

    try {
      await prepareAndPublish("testuser", "session-1", { mode: "publish" });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PublishError);
      expect((e as PublishError).code).toBe("STALE_DRAFT");
      expect((e as PublishError).httpStatus).toBe(409);
    }
  });

  it("regenerates from zero when no draft exists", async () => {
    const facts = [makeFact({ category: "identity", key: "name" })];
    vi.mocked(getAllFacts).mockReturnValue(facts as any);
    vi.mocked(getDraft).mockReturnValue(null);

    const result = await prepareAndPublish("testuser", "session-1", { mode: "register" });

    expect(result.success).toBe(true);
    expect(result.regenerated).toBe(true);
    expect(composeOptimisticPage).toHaveBeenCalled();
    expect(upsertDraft).toHaveBeenCalled();
  });

  it("preserves theme/style from existing draft when regenerating", async () => {
    const facts = [makeFact({ category: "identity", key: "name", updatedAt: "2026-01-01T14:00:00Z" })];
    vi.mocked(getAllFacts).mockReturnValue(facts as any);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig({ theme: "warm", style: { colorScheme: "dark", primaryColor: "#ff0000", fontFamily: "serif", layout: "centered" } }),
      username: "testuser",
      status: "draft",
      configHash: "hash-old",
      updatedAt: "2026-01-01T12:00:00Z",
    });

    // composeOptimisticPage returns default theme/style
    vi.mocked(composeOptimisticPage).mockReturnValue(makeConfig());

    await prepareAndPublish("testuser", "session-1", { mode: "register" });

    // translatePageContent should receive config with warm theme and dark colorScheme
    const { translatePageContent } = await import("@/lib/ai/translate");
    const translatedConfig = vi.mocked(translatePageContent).mock.calls[0][0] as PageConfig;
    expect(translatedConfig.theme).toBe("warm");
    expect(translatedConfig.style.colorScheme).toBe("dark");
    expect(translatedConfig.style.primaryColor).toBe("#ff0000");
  });

  it("rejects with STALE_PREVIEW_HASH when expectedHash doesn't match", async () => {
    const facts = [makeFact({ category: "identity", key: "name", updatedAt: "2026-01-01T10:00:00Z" })];
    vi.mocked(getAllFacts).mockReturnValue(facts as any);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig(),
      username: "testuser",
      status: "draft",
      configHash: "hash-current",
      updatedAt: "2026-01-01T12:00:00Z",
    });

    try {
      await prepareAndPublish("testuser", "session-1", {
        mode: "publish",
        expectedHash: "hash-stale",
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PublishError);
      expect((e as PublishError).code).toBe("STALE_PREVIEW_HASH");
      expect((e as PublishError).httpStatus).toBe(409);
    }
  });

  it("passes when expectedHash matches current configHash", async () => {
    const facts = [makeFact({ category: "identity", key: "name", updatedAt: "2026-01-01T10:00:00Z" })];
    vi.mocked(getAllFacts).mockReturnValue(facts as any);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig(),
      username: "testuser",
      status: "draft",
      configHash: "hash-current",
      updatedAt: "2026-01-01T12:00:00Z",
    });

    const result = await prepareAndPublish("testuser", "session-1", {
      mode: "publish",
      expectedHash: "hash-current",
    });

    expect(result.success).toBe(true);
  });
});
