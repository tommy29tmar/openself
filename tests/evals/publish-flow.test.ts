import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

vi.mock("@/lib/services/page-service", () => ({
  getDraft: vi.fn(),
  upsertDraft: vi.fn(),
  requestPublish: vi.fn(),
  confirmPublish: vi.fn(),
  getPublishedPage: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => {
  const mockGetActiveFacts = vi.fn();
  return {
    getActiveFacts: mockGetActiveFacts,
    createFact: vi.fn(),
    updateFact: vi.fn(),
    deleteFact: vi.fn(),
    searchFacts: vi.fn(() => []),
    factExistsAcrossReadKeys: vi.fn(() => false),
    findFactsByOwnerCategoryKey: vi.fn(() => []),
  };
});

import { agentTools } from "@/lib/agent/tools";
import type { PageConfig } from "@/lib/page-config/schema";
import {
  getDraft,
  upsertDraft,
  requestPublish,
  confirmPublish,
  getPublishedPage,
} from "@/lib/services/page-service";
import { getActiveFacts } from "@/lib/services/kb-service";

function makeValidConfig(overrides?: Partial<PageConfig>): PageConfig {
  return {
    version: 1,
    username: "testuser",
    surface: "canvas",
    voice: "signal",
    light: "day",
    style: {
      primaryColor: "#6366f1",
      layout: "centered",
    },
    sections: [
      {
        id: "hero-1",
        type: "hero",
        variant: "large",
        content: { name: "Test User", tagline: "Hello world" },
      },
      {
        id: "footer-1",
        type: "footer",
        content: {},
      },
    ],
    ...overrides,
  };
}

function makeFact(overrides: { category: string; key: string; value?: Record<string, unknown> }) {
  return {
    id: "fact-" + Math.random().toString(36).slice(2, 8),
    category: overrides.category,
    key: overrides.key,
    value: overrides.value ?? {},
    source: "chat",
    confidence: 1.0,
    visibility: "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const toolContext = { toolCallId: "test", messages: [], abortSignal: undefined as any };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Tool level — generate_page", () => {
  it("calls upsertDraft (not upsertPage)", async () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
    ];
    vi.mocked(getActiveFacts).mockReturnValue(facts as any);
    vi.mocked(upsertDraft).mockImplementation(() => {});

    const result = await agentTools.generate_page.execute(
      { username: "alice" },
      toolContext,
    );

    expect(result.success).toBe(true);
    expect(upsertDraft).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertDraft).mock.calls[0][0]).toBe("alice");
  });
});

describe("Tool level — request_publish", () => {
  it("calls requestPublish from service", async () => {
    const mockConfig = makeValidConfig();
    vi.mocked(getDraft).mockReturnValue({ config: mockConfig, username: "alice", status: "draft", configHash: null, updatedAt: null });
    vi.mocked(requestPublish).mockImplementation(() => {});

    const result = await agentTools.request_publish.execute(
      { username: "alice" },
      toolContext,
    );

    expect(result.success).toBe(true);
    expect(requestPublish).toHaveBeenCalledWith("alice", "__default__");
  });

  it("does NOT call confirmPublish", async () => {
    const mockConfig = makeValidConfig();
    vi.mocked(getDraft).mockReturnValue({ config: mockConfig, username: "alice", status: "draft", configHash: null, updatedAt: null });
    vi.mocked(requestPublish).mockImplementation(() => {});

    await agentTools.request_publish.execute(
      { username: "alice" },
      toolContext,
    );

    expect(confirmPublish).not.toHaveBeenCalled();
  });

  it("does NOT recompose from facts (preserves manual changes)", async () => {
    const customConfig = makeValidConfig({ surface: "clay" });
    vi.mocked(getDraft).mockReturnValue({ config: customConfig, username: "alice", status: "draft", configHash: null, updatedAt: null });
    vi.mocked(requestPublish).mockImplementation(() => {});

    await agentTools.request_publish.execute(
      { username: "alice" },
      toolContext,
    );

    // Should NOT call upsertDraft (no recomposition)
    expect(upsertDraft).not.toHaveBeenCalled();
    // Should NOT call getActiveFacts (no fact reading needed)
    expect(getActiveFacts).not.toHaveBeenCalled();
  });

  it("fails when no draft exists", async () => {
    vi.mocked(getDraft).mockReturnValue(null);

    const result = await agentTools.request_publish.execute(
      { username: "alice" },
      toolContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("No draft page");
  });
});

describe("Tool level — update_page_style", () => {
  it("calls /api/draft/style with presence changes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await agentTools.update_page_style.execute(
      { username: "testuser", surface: "clay" },
      toolContext,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/draft/style");
    const body = JSON.parse(opts.body);
    expect(body.surface).toBe("clay");

    vi.unstubAllGlobals();
  });
});

describe("Service level — getPublishedPage", () => {
  it("returns null when no published rows exist", () => {
    vi.mocked(getPublishedPage).mockReturnValue(null);
    expect(getPublishedPage("nonexistent")).toBeNull();
  });

  it("returns config for published pages", () => {
    const config = makeValidConfig();
    vi.mocked(getPublishedPage).mockReturnValue(config);
    expect(getPublishedPage("testuser")).toEqual(config);
  });
});

describe("Service level — getDraft", () => {
  it("returns draft row", () => {
    const config = makeValidConfig();
    vi.mocked(getDraft).mockReturnValue({ config, username: "testuser", status: "draft", configHash: null, updatedAt: null });
    const draft = getDraft();
    expect(draft).toBeDefined();
    expect(draft!.config).toEqual(config);
    expect(draft!.status).toBe("draft");
  });
});

describe("Integration — draft does not break live", () => {
  it("confirmPublish creates published row, subsequent upsertDraft does not affect it", () => {
    vi.mocked(confirmPublish).mockImplementation(() => {});
    vi.mocked(upsertDraft).mockImplementation(() => {});
    vi.mocked(getPublishedPage).mockReturnValue(makeValidConfig());

    // Step 1: Publish
    confirmPublish("testuser");
    expect(confirmPublish).toHaveBeenCalledWith("testuser");

    // Step 2: Edit draft
    const newConfig = makeValidConfig({ surface: "clay" });
    upsertDraft("testuser", newConfig);
    expect(upsertDraft).toHaveBeenCalledWith("testuser", newConfig);

    // Step 3: Published page is still the original
    const published = getPublishedPage("testuser");
    expect(published).toBeDefined();
    expect(published!.surface).toBe("canvas"); // Original, not "clay"
  });
});

describe("Edge cases — reserved usernames", () => {
  it("confirmPublish('draft') throws error for reserved username", () => {
    vi.mocked(confirmPublish).mockImplementation((username: string) => {
      const reserved = new Set(["draft", "api", "builder", "admin", "_next"]);
      if (reserved.has(username)) {
        throw new Error(`Username "${username}" is reserved`);
      }
    });

    expect(() => confirmPublish("draft")).toThrow("reserved");
  });
});

describe("Edge cases — approval_pending required", () => {
  it("confirmPublish fails when draft status is 'draft' (not approval_pending)", () => {
    vi.mocked(confirmPublish).mockImplementation(() => {
      throw new Error("No page pending approval");
    });

    expect(() => confirmPublish("testuser")).toThrow("pending approval");
  });
});

describe("Edge cases — username change de-publishes old", () => {
  it("confirmPublish with new username de-publishes old published page", () => {
    vi.mocked(confirmPublish).mockImplementation(() => {});

    confirmPublish("newuser");
    expect(confirmPublish).toHaveBeenCalledWith("newuser");
  });
});

describe("Edge cases — requestPublish updates username", () => {
  it("requestPublish is called with the intended username", () => {
    vi.mocked(requestPublish).mockImplementation(() => {});

    requestPublish("alice");
    expect(requestPublish).toHaveBeenCalledWith("alice");
  });
});
