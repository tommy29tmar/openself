import { beforeEach, describe, expect, it, vi } from "vitest";

const canFullyValidateSectionMock = vi.fn();
const toSlotAssignmentsMock = vi.fn();
const assignSlotsFromFactsMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {},
  sqlite: { transaction: vi.fn((fn: () => void) => fn) },
}));

vi.mock("@/lib/services/kb-service", () => {
  const mockGetActiveFacts = vi.fn();
  return {
    getActiveFacts: mockGetActiveFacts,
    setFactVisibility: vi.fn(),
  };
});

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
    style: {
      colorScheme: "light",
      primaryColor: "#6366f1",
      fontFamily: "inter",
      layout: "centered",
    },
    sections: [
      { id: "hero-1", type: "hero", content: { name: "Test", tagline: "Hello" } },
      { id: "footer-1", type: "footer", content: {} },
    ],
  })),
}));

vi.mock("@/lib/ai/translate", () => ({
  translatePageContent: vi.fn(async (config: unknown) => config),
}));

vi.mock("@/lib/page-config/normalize", () => ({
  normalizeConfigForWrite: vi.fn((config: unknown) => config),
}));

vi.mock("@/lib/layout/registry", () => ({
  resolveLayoutTemplate: vi.fn(() => ({ id: "monolith", slots: [] })),
}));

vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: (...args: any[]) => assignSlotsFromFactsMock(...args),
}));

vi.mock("@/lib/layout/validate-adapter", () => ({
  canFullyValidateSection: (...args: any[]) => canFullyValidateSectionMock(...args),
  toSlotAssignments: (...args: any[]) => toSlotAssignmentsMock(...args),
}));

vi.mock("@/lib/layout/widgets", () => ({
  buildWidgetMap: vi.fn(() => ({})),
}));

vi.mock("@/lib/layout/quality", () => ({
  validateLayoutComposition: vi.fn(() => ({
    ok: true,
    errors: [],
    warnings: [],
    all: [],
  })),
}));

vi.mock("@/lib/services/personalization-projection", () => ({
  mergeActiveSectionCopy: vi.fn((config: unknown) => config),
}));

vi.mock("@/lib/services/session-service", () => ({
  getSession: vi.fn(() => null),
}));

import { getActiveFacts } from "@/lib/services/kb-service";
import { getDraft } from "@/lib/services/page-service";
import { prepareAndPublish, PublishError } from "@/lib/services/publish-pipeline";

function makeDraft() {
  return {
    config: {
      version: 1,
      username: "testuser",
      theme: "minimal",
      style: {
        colorScheme: "light",
        primaryColor: "#6366f1",
        fontFamily: "inter",
        layout: "centered",
      },
      sections: [
        { id: "hero-1", type: "hero", content: { name: "Test", tagline: "Hello" } },
        { id: "footer-1", type: "footer", content: {} },
      ],
    },
    username: "testuser",
    status: "draft",
    configHash: "hash-current",
    updatedAt: "2026-01-01T12:00:00Z",
  };
}

function makeFacts() {
  return [
    {
      id: "fact-1",
      category: "identity",
      key: "name",
      value: { full: "Test User" },
      source: "chat",
      confidence: 1,
      visibility: "public",
      createdAt: "2026-01-01T10:00:00Z",
      updatedAt: "2026-01-01T10:00:00Z",
    },
  ] as const;
}

describe("prepareAndPublish layout gate status mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveFacts).mockReturnValue(makeFacts() as any);
    vi.mocked(getDraft).mockReturnValue(makeDraft() as any);
  });

  it("returns LAYOUT_CONFIG_INVALID (400) when skipped sections happen without in-memory assignment", async () => {
    canFullyValidateSectionMock.mockReturnValue(true);
    toSlotAssignmentsMock.mockReturnValue({
      assignments: [],
      skipped: [
        { sectionId: "hero-1", sectionType: "hero", reason: "forced test skip" },
      ],
    });

    await expect(
      prepareAndPublish("testuser", "session-1", { mode: "publish" }),
    ).rejects.toMatchObject({
      code: "LAYOUT_CONFIG_INVALID",
      httpStatus: 400,
    } satisfies Partial<PublishError>);
  });

  it("returns LAYOUT_VALIDATION_INCOMPLETE (500) when skipped sections happen after in-memory assignment", async () => {
    canFullyValidateSectionMock.mockReturnValue(false);
    assignSlotsFromFactsMock.mockReturnValue({
      sections: makeDraft().config.sections,
      issues: [],
    });
    toSlotAssignmentsMock.mockReturnValue({
      assignments: [],
      skipped: [
        { sectionId: "footer-1", sectionType: "footer", reason: "forced post-assignment skip" },
      ],
    });

    await expect(
      prepareAndPublish("testuser", "session-1", { mode: "publish" }),
    ).rejects.toMatchObject({
      code: "LAYOUT_VALIDATION_INCOMPLETE",
      httpStatus: 500,
    } satisfies Partial<PublishError>);

    expect(assignSlotsFromFactsMock).toHaveBeenCalled();
    const args = assignSlotsFromFactsMock.mock.calls[0];
    expect(args[3]).toEqual({ repair: false });
  });
});
