/**
 * Tests that composeOptimisticPage with profileId includes avatarUrl
 * in the hero section when an avatar exists.
 *
 * Uses vi.mock to mock getProfileAvatar since we don't want to
 * depend on a real DB with media_assets rows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock media-service before importing page-composer
vi.mock("@/lib/services/media-service", () => ({
  getProfileAvatar: vi.fn(),
}));

import { composeOptimisticPage } from "@/lib/services/page-composer";
import { getProfileAvatar } from "@/lib/services/media-service";
import type { FactRow } from "@/lib/services/kb-service";

const mockedGetProfileAvatar = vi.mocked(getProfileAvatar);

function makeFact(overrides: Partial<FactRow> & { id: string; category: string; key: string; value: Record<string, unknown> }): FactRow {
  return {
    sessionId: "test",
    profileId: "test-profile",
    source: "chat",
    confidence: 1,
    visibility: "public",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sortOrder: 0,
    parentFactId: null,
    archivedAt: null,
    ...overrides,
  } as FactRow;
}

const baseFacts: FactRow[] = [
  makeFact({ id: "f1", category: "identity", key: "name", value: { full: "Test User" } }),
  makeFact({ id: "f2", category: "identity", key: "role", value: { role: "developer" } }),
  makeFact({ id: "f3", category: "skill", key: "typescript", value: { name: "TypeScript", level: "advanced" } }),
];

describe("composeOptimisticPage — profileId → avatarUrl", () => {
  beforeEach(() => {
    mockedGetProfileAvatar.mockReset();
  });

  it("includes avatarUrl when profileId is provided and avatar exists", () => {
    mockedGetProfileAvatar.mockReturnValue("media-uuid-123");

    const config = composeOptimisticPage(baseFacts, "test", "en", undefined, undefined, "test-profile");
    const hero = config.sections.find(s => s.type === "hero");

    expect(hero).toBeDefined();
    expect(hero!.content.avatarUrl).toBe("/api/media/media-uuid-123");
    expect(mockedGetProfileAvatar).toHaveBeenCalledWith("test-profile");
  });

  it("omits avatarUrl when profileId is provided but no avatar exists", () => {
    mockedGetProfileAvatar.mockReturnValue(null);

    const config = composeOptimisticPage(baseFacts, "test", "en", undefined, undefined, "test-profile");
    const hero = config.sections.find(s => s.type === "hero");

    expect(hero).toBeDefined();
    expect(hero!.content.avatarUrl).toBeUndefined();
  });

  it("omits avatarUrl when no profileId is provided", () => {
    const config = composeOptimisticPage(baseFacts, "test", "en");
    const hero = config.sections.find(s => s.type === "hero");

    expect(hero).toBeDefined();
    expect(hero!.content.avatarUrl).toBeUndefined();
    expect(mockedGetProfileAvatar).not.toHaveBeenCalled();
  });
});
