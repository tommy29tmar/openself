import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRun = vi.fn();
const mockOnConflictDoNothing = vi.fn(() => ({ run: mockRun }));
const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    update: vi.fn(),
    select: vi.fn(),
  },
  sqlite: {
    prepare: vi.fn(),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  jobs: {},
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(() => ({})),
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
    cognitiveOwnerKey: "owner-1",
    knowledgeReadKeys: ["owner-1"],
    knowledgePrimaryKey: "owner-1",
    currentSessionId: "owner-1",
  })),
}));

vi.mock("@/lib/worker/handlers/consolidate-episodes", () => ({
  consolidateEpisodesHandler: vi.fn(),
}));

vi.mock("@/lib/services/memory-service", () => ({
  saveMemory: vi.fn(),
}));

vi.mock("@/lib/connectors/register-all", () => ({}));

import { enqueueJob } from "@/lib/worker/index";

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
  mockOnConflictDoNothing.mockReturnValue({ run: mockRun });
});

describe("enqueueJob", () => {
  it("returns a job id when the insert succeeds", () => {
    mockRun.mockReturnValue({ changes: 1 });

    const jobId = enqueueJob("heartbeat_light", { ownerKey: "owner-1" });

    expect(jobId).toEqual(expect.any(String));
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("returns null when onConflictDoNothing skips the insert", () => {
    mockRun.mockReturnValue({ changes: 0 });

    const jobId = enqueueJob("memory_summary", { ownerKey: "owner-1" });

    expect(jobId).toBeNull();
  });
});
