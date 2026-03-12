import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolveOwnerScope = vi.fn();
const mockIsMultiUserEnabled = vi.fn();
const mockGetActivityFeed = vi.fn((_ownerKey: string, _opts?: { limit: number }) => [] as any[]);
const mockGetUnreadCount = vi.fn((_ownerKey: string) => 5);
const mockMarkFeedViewed = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: (...args: any[]) => mockResolveOwnerScope(...args),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: () => mockIsMultiUserEnabled(),
}));

vi.mock("@/lib/services/activity-feed-service", () => ({
  getActivityFeed: (ownerKey: string, opts?: { limit: number }) => mockGetActivityFeed(ownerKey, opts),
  getUnreadCount: (ownerKey: string) => mockGetUnreadCount(ownerKey),
  markFeedViewed: (ownerKey: string) => mockMarkFeedViewed(ownerKey),
}));

const ownerScope = {
  cognitiveOwnerKey: "owner1",
  knowledgePrimaryKey: "sess-1",
  knowledgeReadKeys: ["sess-1"],
  currentSessionId: "sess-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsMultiUserEnabled.mockReturnValue(false);
  mockResolveOwnerScope.mockReturnValue(ownerScope);
});

// ---------------------------------------------------------------------------
// GET /api/activity-feed
// ---------------------------------------------------------------------------

describe("GET /api/activity-feed", () => {
  it("returns feed items", async () => {
    const { GET } = await import("@/app/api/activity-feed/route");
    const req = new Request("http://localhost/api/activity-feed");
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.items).toEqual([]);
  });

  it("calls getActivityFeed with the ownerKey and default limit", async () => {
    const { GET } = await import("@/app/api/activity-feed/route");
    const req = new Request("http://localhost/api/activity-feed");
    await GET(req);
    expect(mockGetActivityFeed).toHaveBeenCalledWith("owner1", { limit: 30 });
  });

  it("respects limit query param", async () => {
    const { GET } = await import("@/app/api/activity-feed/route");
    const req = new Request("http://localhost/api/activity-feed?limit=5");
    await GET(req);
    expect(mockGetActivityFeed).toHaveBeenCalledWith("owner1", { limit: 5 });
  });

  it("uses __default__ ownerKey when scope is null in single-user mode", async () => {
    mockResolveOwnerScope.mockReturnValue(null);
    const { GET } = await import("@/app/api/activity-feed/route");
    const req = new Request("http://localhost/api/activity-feed");
    await GET(req);
    expect(mockGetActivityFeed).toHaveBeenCalledWith("__default__", { limit: 30 });
  });

  it("returns 401 in multi-user mode without auth", async () => {
    mockIsMultiUserEnabled.mockReturnValue(true);
    mockResolveOwnerScope.mockReturnValue(null);
    const { GET } = await import("@/app/api/activity-feed/route");
    const req = new Request("http://localhost/api/activity-feed");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.code).toBe("UNAUTHORIZED");
  });

  it("returns items from service", async () => {
    const fakeItems = [{ id: "item-1", type: "connector_sync" }] as any;
    mockGetActivityFeed.mockReturnValue(fakeItems);
    const { GET } = await import("@/app/api/activity-feed/route");
    const req = new Request("http://localhost/api/activity-feed");
    const res = await GET(req);
    const data = await res.json();
    expect(data.items).toEqual(fakeItems);
  });
});

// ---------------------------------------------------------------------------
// GET /api/activity-feed/unread-count
// ---------------------------------------------------------------------------

describe("GET /api/activity-feed/unread-count", () => {
  it("returns unread count", async () => {
    const { GET } = await import("@/app/api/activity-feed/unread-count/route");
    const req = new Request("http://localhost/api/activity-feed/unread-count");
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBe(5);
  });

  it("calls getUnreadCount with the ownerKey", async () => {
    const { GET } = await import("@/app/api/activity-feed/unread-count/route");
    const req = new Request("http://localhost/api/activity-feed/unread-count");
    await GET(req);
    expect(mockGetUnreadCount).toHaveBeenCalledWith("owner1");
  });

  it("uses __default__ ownerKey when scope is null in single-user mode", async () => {
    mockResolveOwnerScope.mockReturnValue(null);
    const { GET } = await import("@/app/api/activity-feed/unread-count/route");
    const req = new Request("http://localhost/api/activity-feed/unread-count");
    await GET(req);
    expect(mockGetUnreadCount).toHaveBeenCalledWith("__default__");
  });

  it("returns 401 in multi-user mode without auth", async () => {
    mockIsMultiUserEnabled.mockReturnValue(true);
    mockResolveOwnerScope.mockReturnValue(null);
    const { GET } = await import("@/app/api/activity-feed/unread-count/route");
    const req = new Request("http://localhost/api/activity-feed/unread-count");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe("UNAUTHORIZED");
  });
});

// ---------------------------------------------------------------------------
// POST /api/activity-feed/mark-viewed
// ---------------------------------------------------------------------------

describe("POST /api/activity-feed/mark-viewed", () => {
  it("marks feed as viewed and returns success", async () => {
    const { POST } = await import("@/app/api/activity-feed/mark-viewed/route");
    const req = new Request("http://localhost/api/activity-feed/mark-viewed", {
      method: "POST",
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("calls markFeedViewed with the ownerKey", async () => {
    const { POST } = await import("@/app/api/activity-feed/mark-viewed/route");
    const req = new Request("http://localhost/api/activity-feed/mark-viewed", {
      method: "POST",
    });
    await POST(req);
    expect(mockMarkFeedViewed).toHaveBeenCalledWith("owner1");
  });

  it("uses __default__ ownerKey when scope is null in single-user mode", async () => {
    mockResolveOwnerScope.mockReturnValue(null);
    const { POST } = await import("@/app/api/activity-feed/mark-viewed/route");
    const req = new Request("http://localhost/api/activity-feed/mark-viewed", {
      method: "POST",
    });
    await POST(req);
    expect(mockMarkFeedViewed).toHaveBeenCalledWith("__default__");
  });

  it("returns 401 in multi-user mode without auth", async () => {
    mockIsMultiUserEnabled.mockReturnValue(true);
    mockResolveOwnerScope.mockReturnValue(null);
    const { POST } = await import("@/app/api/activity-feed/mark-viewed/route");
    const req = new Request("http://localhost/api/activity-feed/mark-viewed", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe("UNAUTHORIZED");
  });
});
