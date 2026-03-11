import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch to control GitHub API responses
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import after stubbing fetch
const { fetchUserEvents } = await import("@/lib/connectors/github/client");

const makeEvent = (id: string) => ({
  id,
  type: "PushEvent",
  created_at: "2026-03-10T12:00:00Z",
  repo: { name: "user/repo" },
  payload: {},
});

const okResponse = (events: any[], hasNext = false) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(events),
  headers: new Headers(
    hasNext
      ? { Link: '<https://api.github.com/next>; rel="next"' }
      : {},
  ),
});

describe("fetchUserEvents", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns events up to boundary (lastSeenEventId)", async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse([makeEvent("5"), makeEvent("4"), makeEvent("3")]),
    );
    const result = await fetchUserEvents("token", "user", "3");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("5");
  });

  it("returns empty array on 403 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: new Headers(),
    });
    const result = await fetchUserEvents("token", "user");
    expect(result).toHaveLength(0);
  });

  it("returns all events when no boundary provided", async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse([makeEvent("3"), makeEvent("2"), makeEvent("1")]),
    );
    const result = await fetchUserEvents("token", "user");
    expect(result).toHaveLength(3);
  });

  it("paginates across multiple pages", async () => {
    mockFetch
      .mockResolvedValueOnce(
        okResponse([makeEvent("4"), makeEvent("3")], true),
      )
      .mockResolvedValueOnce(
        okResponse([makeEvent("2"), makeEvent("1")]),
      );
    const result = await fetchUserEvents("token", "user");
    expect(result).toHaveLength(4);
  });
});
