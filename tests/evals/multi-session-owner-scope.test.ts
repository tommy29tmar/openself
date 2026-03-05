import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PageConfig } from "@/lib/page-config/schema";

const SCOPE = {
  cognitiveOwnerKey: "profile-1",
  knowledgeReadKeys: ["session-anchor", "session-rotated"],
  knowledgePrimaryKey: "session-anchor",
  currentSessionId: "session-rotated",
};

const BASE_CONFIG: PageConfig = {
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
    { id: "hero-1", type: "hero", content: { name: "Alice", tagline: "Builder" } },
    { id: "footer-1", type: "footer", content: {} },
  ],
};

let mockDraft: {
  config: PageConfig;
  username: string;
  status: string;
  configHash: string | null;
  updatedAt: string | null;
} | null = null;

const mockMergeActiveSectionCopy = vi.fn((config: PageConfig) => config);
const mockPrepareAndPublish = vi.fn(async () => ({
  success: true as const,
  username: "alice",
  url: "/alice",
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: () => SCOPE,
  getAuthContext: () => ({
    sessionId: SCOPE.currentSessionId,
    profileId: SCOPE.cognitiveOwnerKey,
    userId: "user-1",
    username: "alice",
  }),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: () => true,
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

vi.mock("@/lib/services/page-service", () => ({
  getDraft: () => mockDraft,
  computeConfigHash: () => "hash-123",
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getPreferences: () => ({ language: "en", factLanguage: "en" }),
}));

vi.mock("@/lib/services/page-projection", () => ({
  projectCanonicalConfig: () => BASE_CONFIG,
  publishableFromCanonical: (config: PageConfig) => config,
}));

vi.mock("@/lib/services/personalization-projection", () => ({
  mergeActiveSectionCopy: (...args: unknown[]) => mockMergeActiveSectionCopy(...args),
}));

vi.mock("@/lib/services/publish-pipeline", () => ({
  prepareAndPublish: (...args: unknown[]) => mockPrepareAndPublish(...args),
  PublishError: class PublishError extends Error {
    code: string;
    httpStatus: number;
    constructor(message: string, code: string, httpStatus: number) {
      super(message);
      this.code = code;
      this.httpStatus = httpStatus;
    }
  },
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

const { GET: previewGET } = await import("@/app/api/preview/route");
const { POST: publishPOST } = await import("@/app/api/publish/route");

function makePublishRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("multi-session owner scope propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDraft = {
      config: BASE_CONFIG,
      username: "alice",
      status: "draft",
      configHash: null,
      updatedAt: null,
    };
  });

  it("preview uses cognitive owner for personalization lookups", async () => {
    const response = await previewGET(
      new Request("http://localhost/api/preview?username=alice"),
    );

    expect(response.status).toBe(200);
    expect(mockMergeActiveSectionCopy).toHaveBeenCalledWith(
      BASE_CONFIG,
      "profile-1",
      "en",
      ["session-anchor", "session-rotated"],
    );
  });

  it("publish forwards cognitive owner and readKeys into the pipeline", async () => {
    const response = await publishPOST(
      makePublishRequest({ username: "ignored", expectedHash: "hash-preview" }),
    );

    expect(response.status).toBe(200);
    expect(mockPrepareAndPublish).toHaveBeenCalledWith(
      "alice",
      "session-anchor",
      expect.objectContaining({
        mode: "publish",
        expectedHash: "hash-preview",
        ownerKey: "profile-1",
        readKeys: ["session-anchor", "session-rotated"],
      }),
    );
  });
});
