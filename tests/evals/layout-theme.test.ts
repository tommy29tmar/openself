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
  getActiveFacts: vi.fn(() => []),
  createFact: vi.fn(),
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  searchFacts: vi.fn(() => []),
}));

import { validatePageConfig } from "@/lib/page-config/schema";
import { listSurfaces, listVoices } from "@/lib/presence";
import type { PageConfig } from "@/lib/page-config/schema";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { agentTools } from "@/lib/agent/tools";
import { getDraft, upsertDraft } from "@/lib/services/page-service";

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

describe("Layout validation", () => {
  it("accepts centered, split, and stack layouts", () => {
    for (const layout of ["centered", "split", "stack"] as const) {
      const config = makeValidConfig({
        style: {
          primaryColor: "#000",
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
        primaryColor: "#000",
        layout: "grid" as any,
      },
    });
    const result = validatePageConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("layout"))).toBe(true);
  });
});

describe("Presence validation in validatePageConfig", () => {
  it("accepts valid surfaces: canvas, clay, archive", () => {
    for (const surface of ["canvas", "clay", "archive"]) {
      const config = makeValidConfig({ surface });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    }
  });

  it("rejects unknown surface 'hacker'", () => {
    const config = makeValidConfig({ surface: "hacker" });
    const result = validatePageConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("surface"))).toBe(true);
  });

  it("accepts valid voices: signal, narrative, terminal", () => {
    for (const voice of ["signal", "narrative", "terminal"]) {
      const config = makeValidConfig({ voice });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    }
  });

  it("rejects unknown voice 'bold'", () => {
    const config = makeValidConfig({ voice: "bold" });
    const result = validatePageConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("voice"))).toBe(true);
  });
});

describe("Presence registry", () => {
  it("listSurfaces returns canvas, clay, archive", () => {
    const surfaces = listSurfaces().map((s) => s.id);
    expect(surfaces).toContain("canvas");
    expect(surfaces).toContain("clay");
    expect(surfaces).toContain("archive");
    expect(surfaces).toHaveLength(3);
  });

  it("listVoices returns signal, narrative, terminal", () => {
    const voices = listVoices().map((v) => v.id);
    expect(voices).toContain("signal");
    expect(voices).toContain("narrative");
    expect(voices).toContain("terminal");
    expect(voices).toHaveLength(3);
  });
});

describe("composeOptimisticPage defaults", () => {
  it("produces layout 'centered' and surface 'canvas' by default", () => {
    const page = composeOptimisticPage([], "testuser");
    expect(page.style.layout).toBe("centered");
    expect(page.surface).toBe("canvas");
    expect(page.voice).toBe("signal");
    expect(page.light).toBe("day");
  });
});

describe("update_page_style tool", () => {
  it("rejects unknown surface via fetch error handling", async () => {
    // The tool calls fetch(/api/draft/style). When fetch fails (e.g. network error),
    // the tool returns success: false. We mock fetch to simulate API rejection.
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Unknown surface: \"hacker\"" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await agentTools.update_page_style.execute(
      { username: "testuser", surface: "hacker" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(false);

    vi.unstubAllGlobals();
  });

  it("accepts valid surface 'clay' (fetch succeeds)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await agentTools.update_page_style.execute(
      { username: "testuser", surface: "clay" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(true);

    vi.unstubAllGlobals();
  });

  it("accepts valid voice 'narrative' (fetch succeeds)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await agentTools.update_page_style.execute(
      { username: "testuser", voice: "narrative" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(true);

    vi.unstubAllGlobals();
  });

  it("accepts light 'night' (fetch succeeds)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await agentTools.update_page_style.execute(
      { username: "testuser", light: "night" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(true);

    vi.unstubAllGlobals();
  });
});
