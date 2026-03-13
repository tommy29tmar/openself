import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(),
      all: vi.fn(() => []),
    })),
  },
  db: {},
}));

const mockPayload = {
  journeyState: "active_fresh" as const,
  situations: [] as string[],
  expertiseLevel: "familiar" as const,
  userName: "Tommaso",
  lastSeenDaysAgo: 2,
  publishedUsername: "tommaso",
  pendingProposalCount: 0,
  thinSections: [],
  staleFacts: [],
  openConflicts: [],
  archivableFacts: [],
  language: "it",
  conversationContext: null,
  archetype: "generalist" as const,
};

vi.mock("@/lib/agent/journey", () => ({
  assembleBootstrapPayload: vi.fn(() => ({
    payload: { ...mockPayload },
    data: { facts: [], soul: null, openConflictRecords: [], publishableFacts: [], childCountMap: new Map() },
  })),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: vi.fn(() => ({
    cognitiveOwnerKey: "cog-1",
    knowledgeReadKeys: ["sess-a"],
    knowledgePrimaryKey: "sess-a",
    currentSessionId: "sess-a",
  })),
  getAuthContext: vi.fn(() => null),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: vi.fn(() => false),
  DEFAULT_SESSION_ID: "__default__",
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/services/session-activity", () => ({
  getLastMessageAt: vi.fn(() => null),
  getSessionTtlMinutes: vi.fn(() => 120),
  isSessionActive: vi.fn(() => false),
}));

vi.mock("@/lib/agent/greeting", () => ({
  computeGreeting: vi.fn(() => "Ciao Tommaso! La tua pagina è online."),
}));

import { GET } from "@/app/api/chat/bootstrap/route";
import { isSessionActive } from "@/lib/services/session-activity";

describe("GET /api/chat/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSessionActive).mockReturnValue(false);
  });

  it("returns greeting and isActiveSession=false for expired session", async () => {
    vi.mocked(isSessionActive).mockReturnValue(false);

    const req = new Request("http://localhost/api/chat/bootstrap?language=it");
    const res = await GET(req);
    const data = await res.json();

    expect(data.greeting).toBe("Ciao Tommaso! La tua pagina è online.");
    expect(data.isActiveSession).toBe(false);
    expect(data.journeyState).toBe("active_fresh");
  });

  it("returns isActiveSession=true for active session", async () => {
    vi.mocked(isSessionActive).mockReturnValue(true);

    const req = new Request("http://localhost/api/chat/bootstrap?language=it");
    const res = await GET(req);
    const data = await res.json();

    expect(data.isActiveSession).toBe(true);
    expect(data.greeting).toBeDefined();
  });

  it("returns greeting for anonymous user (no session creation)", async () => {
    vi.mocked(isSessionActive).mockReturnValue(false);

    const req = new Request("http://localhost/api/chat/bootstrap?language=en");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.greeting).toBeDefined();
    expect(typeof data.greeting).toBe("string");
    expect(data.greeting.length).toBeGreaterThan(0);
    expect(data.isActiveSession).toBe(false);
  });
});
