import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  db: {},
  sqlite: { transaction: vi.fn((fn: () => void) => fn) },
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

const mockGetAllFacts = vi.fn();
const mockSetFactVisibility = vi.fn();

vi.mock("@/lib/services/kb-service", () => ({
  getAllFacts: (...args: any[]) => mockGetAllFacts(...args),
  setFactVisibility: (...args: any[]) => mockSetFactVisibility(...args),
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

vi.mock("@/lib/services/auth-service", () => ({
  setProfileUsername: vi.fn(),
}));

vi.mock("@/lib/layout/registry", () => ({
  resolveLayoutTemplate: vi.fn(() => ({
    id: "vertical",
    slots: [{ id: "main", label: "Main", accepts: "*" }],
  })),
}));

vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: vi.fn((_t: any, sections: any) => ({ sections })),
}));

vi.mock("@/lib/layout/quality", () => ({
  validateLayoutComposition: vi.fn(() => ({ all: [], errors: [], warnings: [] })),
}));

vi.mock("@/lib/layout/widgets", () => ({
  buildWidgetMap: vi.fn(() => new Map()),
}));

vi.mock("@/lib/layout/validate-adapter", () => ({
  toSlotAssignments: vi.fn(() => ({ assignments: [], skipped: [] })),
  canFullyValidateSection: vi.fn(() => true),
}));

vi.mock("@/lib/page-config/normalize", () => ({
  normalizeConfigForWrite: vi.fn((config: any) => config),
}));

vi.mock("@/lib/services/personalization-projection", () => ({
  mergeActiveSectionCopy: vi.fn((config: any) => config),
}));

vi.mock("@/lib/flags", () => ({
  PROFILE_ID_CANONICAL: false,
}));

import { prepareAndPublish, PublishError } from "@/lib/services/publish-pipeline";
import {
  getDraft,
  upsertDraft,
  requestPublish,
  confirmPublish,
  computeConfigHash,
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

function makeFact(overrides: { category: string; key: string; visibility?: string; updatedAt?: string }) {
  return {
    id: "fact-" + Math.random().toString(36).slice(2, 8),
    category: overrides.category,
    key: overrides.key,
    value: { name: "test" },
    source: "chat",
    confidence: 1.0,
    visibility: overrides.visibility ?? "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSetFactVisibility.mockReturnValue(undefined);
});

describe("prepareAndPublish", () => {
  it("throws NO_FACTS when facts are empty", async () => {
    mockGetAllFacts.mockReturnValue([]);

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

  it("throws NO_PUBLISHABLE_FACTS when all facts are private", async () => {
    const facts = [makeFact({ category: "skill", key: "js", visibility: "private" })];
    mockGetAllFacts.mockReturnValue(facts);

    try {
      await prepareAndPublish("testuser", "session-1", { mode: "register" });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PublishError);
      expect((e as PublishError).code).toBe("NO_PUBLISHABLE_FACTS");
      expect((e as PublishError).httpStatus).toBe(400);
    }
  });

  it("always recomposes from facts (never uses cached draft.config)", async () => {
    const facts = [makeFact({ category: "identity", key: "name" })];
    mockGetAllFacts.mockReturnValue(facts);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig(),
      username: "testuser",
      status: "draft",
      configHash: "hash-old",
      updatedAt: "2026-01-01T12:00:00Z",
    });

    const result = await prepareAndPublish("testuser", "session-1", { mode: "publish" });

    expect(result.success).toBe(true);
    // Pipeline always calls upsertDraft with the recomposed+translated config
    expect(upsertDraft).toHaveBeenCalled();
    expect(requestPublish).toHaveBeenCalledWith("testuser", "session-1");
    expect(confirmPublish).toHaveBeenCalledWith("testuser", "session-1");
  });

  it("promotes proposed facts to public in the transaction", async () => {
    const facts = [
      makeFact({ category: "identity", key: "name", visibility: "proposed" }),
      makeFact({ category: "skill", key: "js", visibility: "public" }),
    ];
    mockGetAllFacts.mockReturnValue(facts);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig(),
      username: "testuser",
      status: "draft",
      configHash: "hash-abc",
      updatedAt: "2026-01-01T12:00:00Z",
    });

    await prepareAndPublish("testuser", "session-1", { mode: "publish" });

    // Only the proposed fact should be promoted
    expect(mockSetFactVisibility).toHaveBeenCalledTimes(1);
    expect(mockSetFactVisibility).toHaveBeenCalledWith(
      facts[0].id, "public", "user", "session-1",
    );
  });

  it("does not promote already-public facts", async () => {
    const facts = [
      makeFact({ category: "skill", key: "js", visibility: "public" }),
    ];
    mockGetAllFacts.mockReturnValue(facts);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig(),
      username: "testuser",
      status: "draft",
      configHash: "hash-abc",
      updatedAt: "2026-01-01T12:00:00Z",
    });

    await prepareAndPublish("testuser", "session-1", { mode: "publish" });

    expect(mockSetFactVisibility).not.toHaveBeenCalled();
  });

  it("publishes from zero when no draft exists", async () => {
    const facts = [makeFact({ category: "identity", key: "name" })];
    mockGetAllFacts.mockReturnValue(facts);
    vi.mocked(getDraft).mockReturnValue(null);

    const result = await prepareAndPublish("testuser", "session-1", { mode: "register" });

    expect(result.success).toBe(true);
    expect(upsertDraft).toHaveBeenCalled();
  });

  it("preserves theme/style from existing draft metadata", async () => {
    const facts = [makeFact({ category: "identity", key: "name" })];
    mockGetAllFacts.mockReturnValue(facts);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig({ theme: "warm", style: { colorScheme: "dark", primaryColor: "#ff0000", fontFamily: "serif", layout: "centered" } }),
      username: "testuser",
      status: "draft",
      configHash: "hash-old",
      updatedAt: "2026-01-01T12:00:00Z",
    });

    await prepareAndPublish("testuser", "session-1", { mode: "register" });

    // translatePageContent should receive config with warm theme and dark colorScheme
    const { translatePageContent } = await import("@/lib/ai/translate");
    const translatedConfig = vi.mocked(translatePageContent).mock.calls[0][0] as PageConfig;
    expect(translatedConfig.theme).toBe("warm");
    expect(translatedConfig.style.colorScheme).toBe("dark");
    expect(translatedConfig.style.primaryColor).toBe("#ff0000");
  });

  it("rejects with STALE_PREVIEW_HASH when expectedHash doesn't match", async () => {
    const facts = [makeFact({ category: "identity", key: "name" })];
    mockGetAllFacts.mockReturnValue(facts);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig(),
      username: "testuser",
      status: "draft",
      configHash: "hash-current",
      updatedAt: "2026-01-01T12:00:00Z",
    });
    // computeConfigHash returns "hash-abc123" by default, different from "hash-stale"

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

  it("passes when expectedHash matches canonical config hash", async () => {
    const facts = [makeFact({ category: "identity", key: "name" })];
    mockGetAllFacts.mockReturnValue(facts);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig(),
      username: "testuser",
      status: "draft",
      configHash: "hash-current",
      updatedAt: "2026-01-01T12:00:00Z",
    });

    // computeConfigHash mock returns "hash-abc123", so use that as expectedHash
    const result = await prepareAndPublish("testuser", "session-1", {
      mode: "publish",
      expectedHash: "hash-abc123",
    });

    expect(result.success).toBe(true);
  });

  it("stale hash check runs BEFORE any side-effects", async () => {
    const facts = [
      makeFact({ category: "identity", key: "name", visibility: "proposed" }),
    ];
    mockGetAllFacts.mockReturnValue(facts);
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
        expectedHash: "wrong-hash",
      });
    } catch {
      // Expected
    }

    // No visibility changes should have happened
    expect(mockSetFactVisibility).not.toHaveBeenCalled();
    // No draft should have been written
    expect(upsertDraft).not.toHaveBeenCalled();
    expect(requestPublish).not.toHaveBeenCalled();
    expect(confirmPublish).not.toHaveBeenCalled();
  });

  it("USERNAME_MISMATCH in publish mode when body.username ≠ draft.username", async () => {
    const facts = [makeFact({ category: "identity", key: "name" })];
    mockGetAllFacts.mockReturnValue(facts);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig(),
      username: "alice", // draft says alice
      status: "draft",
      configHash: "hash-abc",
      updatedAt: "2026-01-01T12:00:00Z",
    });

    try {
      // but publish requests "bob"
      await prepareAndPublish("bob", "session-1", { mode: "publish" });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PublishError);
      expect((e as PublishError).code).toBe("USERNAME_MISMATCH");
      expect((e as PublishError).httpStatus).toBe(409);
    }
  });

  it("USERNAME_MISMATCH NOT enforced in register mode", async () => {
    const facts = [makeFact({ category: "identity", key: "name" })];
    mockGetAllFacts.mockReturnValue(facts);
    vi.mocked(getDraft).mockReturnValue({
      config: makeConfig(),
      username: "draft", // draft still has placeholder username
      status: "draft",
      configHash: "hash-abc",
      updatedAt: "2026-01-01T12:00:00Z",
    });

    // register mode: chosen username ≠ draft.username is OK
    const result = await prepareAndPublish("alice", "session-1", { mode: "register" });
    expect(result.success).toBe(true);
  });

  it("sensitive+proposed facts excluded from both projection and promote loop", async () => {
    const facts = [
      makeFact({ category: "compensation", key: "salary", visibility: "proposed" }), // sensitive
      makeFact({ category: "skill", key: "js", visibility: "proposed" }), // non-sensitive
    ];
    mockGetAllFacts.mockReturnValue(facts);
    vi.mocked(getDraft).mockReturnValue(null);

    await prepareAndPublish("testuser", "session-1", { mode: "register" });

    // Only the skill fact should be promoted (compensation is sensitive, excluded by filterPublishableFacts)
    expect(mockSetFactVisibility).toHaveBeenCalledTimes(1);
    expect(mockSetFactVisibility).toHaveBeenCalledWith(
      facts[1].id, "public", "user", "session-1",
    );
  });
});
