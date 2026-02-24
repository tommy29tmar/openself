import { describe, it, expect, vi } from "vitest";

// Mock dependencies
vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

vi.mock("@/lib/services/page-service", () => ({
  getDraft: vi.fn(),
  upsertDraft: vi.fn(),
  requestPublish: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  getAllFacts: vi.fn(() => []),
  createFact: vi.fn(),
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  searchFacts: vi.fn(() => []),
}));

import { validatePageConfig, AVAILABLE_THEMES } from "@/lib/page-config/schema";
import type { PageConfig } from "@/lib/page-config/schema";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { agentTools } from "@/lib/agent/tools";
import { getDraft, upsertDraft } from "@/lib/services/page-service";

function makeValidConfig(overrides?: Partial<PageConfig>): PageConfig {
  return {
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

describe("Layout validation", () => {
  it("accepts centered, split, and stack layouts", () => {
    for (const layout of ["centered", "split", "stack"] as const) {
      const config = makeValidConfig({
        style: {
          colorScheme: "light",
          primaryColor: "#000",
          fontFamily: "inter",
          layout,
        },
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    }
  });

  it("rejects invalid layout 'grid'", () => {
    const config = makeValidConfig({
      style: {
        colorScheme: "light",
        primaryColor: "#000",
        fontFamily: "inter",
        layout: "grid" as any,
      },
    });
    const result = validatePageConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("layout"))).toBe(true);
  });
});

describe("Theme validation in validatePageConfig", () => {
  it("accepts 'minimal' and 'warm' themes", () => {
    for (const theme of ["minimal", "warm"]) {
      const config = makeValidConfig({ theme });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    }
  });

  it("rejects 'hacker' and 'bold' themes", () => {
    for (const theme of ["hacker", "bold"]) {
      const config = makeValidConfig({ theme });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("theme"))).toBe(true);
    }
  });
});

describe("composeOptimisticPage defaults", () => {
  it("produces layout 'centered' and theme 'minimal' by default", () => {
    const page = composeOptimisticPage([], "testuser");
    expect(page.style.layout).toBe("centered");
    expect(page.theme).toBe("minimal");
  });
});

describe("set_theme tool", () => {
  it("rejects unknown themes", async () => {
    const result = await agentTools.set_theme.execute(
      { username: "testuser", theme: "hacker" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown theme");
  });

  it("accepts 'minimal'", async () => {
    const mockConfig = makeValidConfig();
    vi.mocked(getDraft).mockReturnValue({ config: mockConfig, username: "testuser", status: "draft", configHash: null, updatedAt: null });
    vi.mocked(upsertDraft).mockImplementation(() => {});

    const result = await agentTools.set_theme.execute(
      { username: "testuser", theme: "minimal" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(true);
    expect(result.theme).toBe("minimal");
  });

  it("accepts 'warm'", async () => {
    const mockConfig = makeValidConfig();
    vi.mocked(getDraft).mockReturnValue({ config: mockConfig, username: "testuser", status: "draft", configHash: null, updatedAt: null });
    vi.mocked(upsertDraft).mockImplementation(() => {});

    const result = await agentTools.set_theme.execute(
      { username: "testuser", theme: "warm" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(true);
    expect(result.theme).toBe("warm");
  });
});
