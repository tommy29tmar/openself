import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCreds = vi.fn();
const mockUpdateStatus = vi.fn();
vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorWithCredentials: (...args: unknown[]) => mockGetCreds(...args),
  updateConnectorStatus: (...args: unknown[]) => mockUpdateStatus(...args),
}));

const mockBatchCreateFacts = vi.fn().mockResolvedValue({ factsWritten: 3, factsSkipped: 0, errors: [] });
vi.mock("@/lib/connectors/connector-fact-writer", () => ({
  batchCreateFacts: (...args: unknown[]) => mockBatchCreateFacts(...args),
}));

const mockBatchRecordEvents = vi.fn().mockResolvedValue({ eventsWritten: 2, eventsSkipped: 0, errors: [] });
vi.mock("@/lib/connectors/connector-event-writer", () => ({
  batchRecordEvents: (...args: unknown[]) => mockBatchRecordEvents(...args),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: () => ({
    cognitiveOwnerKey: "owner1",
    knowledgePrimaryKey: "kpk1",
    knowledgeReadKeys: undefined,
  }),
}));

vi.mock("@/lib/services/page-service", () => ({
  getDraft: () => ({ username: "testuser" }),
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: () => "en",
}));

// Mock db + sqlite to avoid real DB access
vi.mock("@/lib/db", () => {
  const mockPrepare = vi.fn().mockReturnValue({
    all: vi.fn().mockReturnValue([]),
    run: vi.fn(),
    get: vi.fn(),
  });
  return {
    db: {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ run: vi.fn() }),
        }),
      }),
    },
    sqlite: { prepare: mockPrepare },
  };
});

vi.mock("@/lib/db/schema", () => ({
  connectors: { id: "id" },
  connectorItems: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// Mock validateResolvedIp to avoid real DNS
vi.mock("@/lib/connectors/rss/url-validator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/connectors/rss/url-validator")>("@/lib/connectors/rss/url-validator");
  return {
    ...actual,
    validateResolvedIp: vi.fn().mockResolvedValue({ valid: true }),
  };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { syncRss } from "@/lib/connectors/rss/sync";

describe("syncRss", () => {
  beforeEach(() => vi.clearAllMocks());

  it("first sync creates facts but no events (baseline)", async () => {
    mockGetCreds.mockReturnValue({
      decryptedCredentials: { feed_url: "https://example.com/feed" },
      lastSync: null,
    });

    const feedXml = `<?xml version="1.0"?>
        <rss version="2.0"><channel><title>Blog</title><link>https://example.com</link>
        <item><title>Post</title><link>https://example.com/1</link>
        <pubDate>Mon, 10 Mar 2026 12:00:00 GMT</pubDate><guid>p1</guid></item>
        </channel></rss>`;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(ctrl) { ctrl.enqueue(encoder.encode(feedXml)); ctrl.close(); },
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers([["content-type", "application/xml"]]),
      body: stream,
    });

    const result = await syncRss("conn1", "owner1");
    expect(result.error).toBeUndefined();
    expect(mockBatchCreateFacts).toHaveBeenCalledOnce();
    // First sync = baseline: no events
    expect(result.eventsCreated).toBe(0);
  });

  it("returns error when feed fetch fails", async () => {
    mockGetCreds.mockReturnValue({
      decryptedCredentials: { feed_url: "https://example.com/feed" },
      lastSync: null,
    });
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await syncRss("conn1", "owner1");
    expect(result.error).toBeDefined();
  });

  it("returns error when no credentials", async () => {
    mockGetCreds.mockReturnValue(null);
    const result = await syncRss("conn1", "owner1");
    expect(result.error).toBe("No credentials");
  });
});
