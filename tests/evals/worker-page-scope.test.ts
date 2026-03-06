import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelectAll = vi.fn();
const mockUpdateRun = vi.fn();
const mockSqlRun = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: (...args: unknown[]) => mockSelectAll(...args),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          run: (...args: unknown[]) => mockUpdateRun(...args),
        })),
      })),
    })),
    insert: vi.fn(),
  },
  sqlite: {
    prepare: vi.fn(() => ({
      run: (...args: unknown[]) => mockSqlRun(...args),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  jobs: {},
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(() => ({ sections: [] })),
}));

vi.mock("@/lib/services/page-service", () => ({
  upsertDraft: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: vi.fn(() => []),
}));

vi.mock("@/lib/services/summary-service", () => ({
  generateSummary: vi.fn(),
}));

vi.mock("@/lib/worker/heartbeat", () => ({
  handleHeartbeatLight: vi.fn(),
  handleHeartbeatDeep: vi.fn(),
}));

vi.mock("@/lib/services/soul-service", () => ({
  expireStaleProposals: vi.fn(),
}));

vi.mock("@/lib/connectors/connector-sync-handler", () => ({
  handleConnectorSync: vi.fn(),
}));

vi.mock("@/lib/services/session-compaction-service", () => ({
  runSessionCompaction: vi.fn(),
  persistCompactionLog: vi.fn(),
  getLastCompactionRowid: vi.fn(() => 0),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: vi.fn(() => ({
    cognitiveOwnerKey: "profile-1",
    knowledgeReadKeys: ["sess-anchor", "sess-current"],
    knowledgePrimaryKey: "sess-anchor",
    currentSessionId: "sess-current",
  })),
}));

vi.mock("@/lib/worker/handlers/consolidate-episodes", () => ({
  consolidateEpisodesHandler: vi.fn(),
}));

vi.mock("@/lib/services/memory-service", () => ({
  saveMemory: vi.fn(),
}));

vi.mock("@/lib/connectors/register-all", () => ({}));

import { processJobs } from "@/lib/worker/index";
import { getActiveFacts } from "@/lib/services/kb-service";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { upsertDraft } from "@/lib/services/page-service";

beforeEach(() => {
  vi.clearAllMocks();
  mockSqlRun.mockReturnValue({ changes: 1 });
  mockUpdateRun.mockReturnValue({ changes: 1 });
  mockSelectAll.mockReturnValue([
    {
      id: "job-1",
      jobType: "page_synthesis",
      payload: {
        ownerKey: "profile-1",
        sessionId: "sess-current",
        username: "alice",
        language: "it",
      },
      status: "queued",
      attempts: 0,
      runAfter: new Date().toISOString(),
    },
  ]);
});

describe("worker page job scope", () => {
  it("rebuilds drafts from the owner read scope and writes to the anchor draft", async () => {
    const processed = await processJobs();

    expect(processed).toBe(1);
    expect(getActiveFacts).toHaveBeenCalledWith("profile-1", ["sess-anchor", "sess-current"]);
    expect(composeOptimisticPage).toHaveBeenCalledWith(
      [],
      "alice",
      "it",
      undefined,
      undefined,
      "profile-1",
    );
    expect(upsertDraft).toHaveBeenCalledWith(
      "alice",
      expect.any(Object),
      "sess-anchor",
      "profile-1",
    );
  });
});
