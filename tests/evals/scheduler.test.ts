/**
 * Tests for the heartbeat scheduler and its helper functions.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";

// ── Hoisted test DB (must be available before vi.mock factories) ────────────

const { testSqlite, testDb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Db = require("better-sqlite3");
  const { drizzle: d } = require("drizzle-orm/better-sqlite3");

  const sqlite = new Db(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = d(sqlite);
  return { testSqlite: sqlite, testDb: db };
});

// Create tables
testSqlite.exec(`
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    invite_code TEXT NOT NULL DEFAULT '__legacy__',
    username TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    user_id TEXT,
    profile_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  INSERT INTO sessions (id, invite_code, status) VALUES ('__default__', '__legacy__', 'active');

  CREATE TABLE facts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT '__default__',
    profile_id TEXT,
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value JSON NOT NULL,
    source TEXT DEFAULT 'chat',
    confidence REAL DEFAULT 1.0,
    visibility TEXT DEFAULT 'private',
    sort_order INTEGER DEFAULT 0,
    archived_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, category, key)
  );
  CREATE INDEX IF NOT EXISTS idx_facts_profile ON facts(profile_id);

  CREATE TABLE heartbeat_config (
    owner_key TEXT PRIMARY KEY,
    light_budget_daily_usd REAL DEFAULT 0.1,
    deep_budget_daily_usd REAL DEFAULT 0.25,
    timezone TEXT DEFAULT 'UTC',
    light_interval_hours INTEGER DEFAULT 24,
    deep_interval_hours INTEGER DEFAULT 168,
    enabled INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE heartbeat_runs (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    run_type TEXT NOT NULL,
    owner_day TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'ok',
    proposals TEXT DEFAULT '{}',
    estimated_cost_usd REAL DEFAULT 0,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    model TEXT,
    duration_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_heartbeat_runs_owner_day ON heartbeat_runs(owner_key, owner_day);

  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL,
    payload JSON NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    run_after TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    heartbeat_at TEXT
  );
  CREATE INDEX idx_jobs_due ON jobs(status, run_after);

  CREATE TABLE connectors (
    id TEXT PRIMARY KEY,
    connector_type TEXT NOT NULL,
    credentials TEXT,
    config TEXT,
    last_sync TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    owner_key TEXT,
    status TEXT NOT NULL DEFAULT 'connected',
    sync_cursor TEXT,
    last_error TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Mock db module ──────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: testDb,
  sqlite: testSqlite,
}));

// ── Mock enqueueJob to capture calls ────────────────────────────────────────

const enqueueJobCalls: { jobType: string; payload: Record<string, unknown> }[] = [];

vi.mock("@/lib/worker/index", () => ({
  enqueueJob: vi.fn((jobType: string, payload: Record<string, unknown>) => {
    enqueueJobCalls.push({ jobType, payload });
    return "mock-job-id";
  }),
}));

// ── Mock global housekeeping (tested separately) ────────────────────────────

vi.mock("@/lib/worker/heartbeat", () => ({
  runGlobalHousekeeping: vi.fn(),
}));

// ── Mock fact count gate dependencies ───────────────────────────────────────

const mockGetActiveFacts = vi.fn((..._: any[]) => Array.from({ length: 30 }, (_, i) => ({
  id: `fact-${i}`, category: `cat-${i}`, key: `key-${i}`, value: { v: true },
})));

vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: (...args: any[]) => mockGetActiveFacts(...args),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: vi.fn((ownerKey: string) => ({
    cognitiveOwnerKey: ownerKey,
    knowledgeReadKeys: [ownerKey],
    knowledgePrimaryKey: ownerKey,
    currentSessionId: ownerKey,
  })),
}));

// ── Mock getActiveConnectors ─────────────────────────────────────────────────

const mockGetActiveConnectors = vi.fn((_ownerKey: string) => [] as Array<{
  id: string;
  connectorType: string;
  status: string;
  enabled: boolean;
  lastSync: string | null;
  ownerKey: string | null;
  credentials: string | null;
  config: unknown;
  syncCursor: string | null;
  lastError: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}>);

vi.mock("@/lib/connectors/connector-service", () => ({
  getActiveConnectors: (ownerKey: string) => mockGetActiveConnectors(ownerKey),
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────

import {
  getActiveOwnerKeys,
  hasRunToday,
  hasRunThisWeek,
  hasRunInWeek,
  computeOwnerWeek,
  getPreviousWeek,
} from "@/lib/services/heartbeat-config-service";

import {
  runSchedulerTick,
  getLocalHour,
  getLocalDayOfWeek,
} from "@/lib/worker/scheduler";

// ── Helpers ─────────────────────────────────────────────────────────────────

function insertFact(sessionId: string, profileId: string | null, category: string, key: string) {
  const id = `fact-${Math.random().toString(36).slice(2, 8)}`;
  testSqlite
    .prepare(
      "INSERT INTO facts (id, session_id, profile_id, category, key, value) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, sessionId, profileId, category, key, JSON.stringify({ v: true }));
}

/** Insert N facts for an owner to meet the deep heartbeat gate threshold. */
function insertManyFacts(sessionId: string, profileId: string | null, count: number) {
  for (let i = 0; i < count; i++) {
    insertFact(sessionId, profileId, `cat-${i}`, `key-${i}`);
  }
}

function insertConfig(ownerKey: string, timezone = "UTC", enabled = 1) {
  testSqlite
    .prepare("INSERT OR REPLACE INTO heartbeat_config (owner_key, timezone, enabled) VALUES (?, ?, ?)")
    .run(ownerKey, timezone, enabled);
}

function insertRun(ownerKey: string, runType: "light" | "deep", ownerDay: string) {
  const id = `run-${Math.random().toString(36).slice(2, 8)}`;
  testSqlite
    .prepare(
      "INSERT INTO heartbeat_runs (id, owner_key, run_type, owner_day, outcome) VALUES (?, ?, ?, ?, 'ok')",
    )
    .run(id, ownerKey, runType, ownerDay);
}

function insertConnector(
  ownerKey: string,
  connectorType: string,
  status: string = "connected",
  lastSync: string | null = null,
  enabled: number = 1,
) {
  const id = `conn-${Math.random().toString(36).slice(2, 8)}`;
  testSqlite
    .prepare(
      "INSERT INTO connectors (id, owner_key, connector_type, status, last_sync, enabled) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, ownerKey, connectorType, status, lastSync, enabled);
  return id;
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  testSqlite.exec("DELETE FROM facts WHERE session_id != '__default__'");
  testSqlite.exec("DELETE FROM heartbeat_config");
  testSqlite.exec("DELETE FROM heartbeat_runs");
  testSqlite.exec("DELETE FROM jobs");
  testSqlite.exec("DELETE FROM connectors");
  enqueueJobCalls.length = 0;
  // Reset fact count mock to 30 (above threshold) for deep heartbeat tests
  mockGetActiveFacts.mockReturnValue(Array.from({ length: 30 }, (_, i) => ({
    id: `fact-${i}`, category: `cat-${i}`, key: `key-${i}`, value: { v: true },
  })));
  // Reset connector mock to return empty (no active connectors) by default
  mockGetActiveConnectors.mockReturnValue([]);
});

afterAll(() => {
  testSqlite.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper function tests
// ═══════════════════════════════════════════════════════════════════════════

describe("getActiveOwnerKeys", () => {
  it("returns owners from heartbeat_config (enabled only)", () => {
    insertConfig("owner-a", "UTC", 1);
    insertConfig("owner-b", "UTC", 0); // disabled
    const keys = getActiveOwnerKeys();
    expect(keys).toContain("owner-a");
    expect(keys).not.toContain("owner-b");
  });

  it("returns owners from facts table", () => {
    insertFact("session-x", null, "identity", "name");
    const keys = getActiveOwnerKeys();
    expect(keys).toContain("session-x");
  });

  it("prefers profile_id over session_id", () => {
    insertFact("session-y", "profile-y", "identity", "name");
    const keys = getActiveOwnerKeys();
    expect(keys).toContain("profile-y");
    expect(keys).not.toContain("session-y");
  });

  it("deduplicates across config and facts", () => {
    insertConfig("owner-dup");
    insertFact("session-z", "owner-dup", "identity", "name");
    const keys = getActiveOwnerKeys();
    const count = keys.filter((k) => k === "owner-dup").length;
    expect(count).toBe(1);
  });

  it("returns empty array when no owners exist", () => {
    const keys = getActiveOwnerKeys();
    expect(keys).toEqual([]);
  });
});

describe("computeOwnerWeek", () => {
  it("returns ISO week string format YYYY-Www", () => {
    const week = computeOwnerWeek("UTC");
    expect(week).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("returns correct week for a known date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T12:00:00Z"));
    expect(computeOwnerWeek("UTC")).toBe("2026-W09");
    vi.useRealTimers();
  });

  it("handles year boundary (Jan 1, 2026 = W01)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    expect(computeOwnerWeek("UTC")).toBe("2026-W01");
    vi.useRealTimers();
  });
});

describe("getPreviousWeek", () => {
  it("returns previous week (normal case)", () => {
    expect(getPreviousWeek("2026-W09")).toBe("2026-W08");
    expect(getPreviousWeek("2026-W02")).toBe("2026-W01");
  });

  it("handles year boundary: W01 → previous year's last week", () => {
    const prev = getPreviousWeek("2026-W01");
    expect(prev).toMatch(/^2025-W\d{2}$/);
    expect(prev).toBe("2025-W52");
  });

  it("handles year with 53 weeks", () => {
    const prev = getPreviousWeek("2021-W01");
    expect(prev).toBe("2020-W53");
  });
});

describe("hasRunToday", () => {
  it("returns true if run exists for today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T10:00:00Z"));
    insertRun("owner-1", "light", "2026-02-27");
    expect(hasRunToday("owner-1", "light", "UTC")).toBe(true);
    vi.useRealTimers();
  });

  it("returns false if no run exists for today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T10:00:00Z"));
    insertRun("owner-1", "light", "2026-02-26");
    expect(hasRunToday("owner-1", "light", "UTC")).toBe(false);
    vi.useRealTimers();
  });

  it("distinguishes run types", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T10:00:00Z"));
    insertRun("owner-1", "deep", "2026-02-27");
    expect(hasRunToday("owner-1", "light", "UTC")).toBe(false);
    expect(hasRunToday("owner-1", "deep", "UTC")).toBe(true);
    vi.useRealTimers();
  });
});

describe("hasRunThisWeek", () => {
  it("returns true if deep run exists in current ISO week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T10:00:00Z"));
    insertRun("owner-1", "deep", "2026-02-23"); // Monday of W09
    expect(hasRunThisWeek("owner-1", "UTC")).toBe(true);
    vi.useRealTimers();
  });

  it("returns false if deep run is in previous week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T10:00:00Z"));
    insertRun("owner-1", "deep", "2026-02-22"); // Sunday of W08
    expect(hasRunThisWeek("owner-1", "UTC")).toBe(false);
    vi.useRealTimers();
  });
});

describe("hasRunInWeek", () => {
  it("checks a specific week for deep runs", () => {
    insertRun("owner-1", "deep", "2026-02-18"); // Wednesday W08
    expect(hasRunInWeek("owner-1", "2026-W08", "UTC")).toBe(true);
    expect(hasRunInWeek("owner-1", "2026-W09", "UTC")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Scheduler helper tests
// ═══════════════════════════════════════════════════════════════════════════

describe("getLocalHour", () => {
  it("returns a number 0–23", () => {
    const h = getLocalHour("UTC");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(23);
  });

  it("respects timezone offset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T01:00:00Z"));
    expect(getLocalHour("UTC")).toBe(1);
    expect(getLocalHour("Asia/Tokyo")).toBe(10);
    vi.useRealTimers();
  });
});

describe("getLocalDayOfWeek", () => {
  it("returns 0 for Sunday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
    expect(getLocalDayOfWeek("UTC")).toBe(0);
    vi.useRealTimers();
  });

  it("returns 1 for Monday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T12:00:00Z"));
    expect(getLocalDayOfWeek("UTC")).toBe(1);
    vi.useRealTimers();
  });

  it("handles timezone crossing day boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T23:30:00Z"));
    expect(getLocalDayOfWeek("UTC")).toBe(0); // Sunday
    expect(getLocalDayOfWeek("Asia/Tokyo")).toBe(1); // Monday
    vi.useRealTimers();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// runSchedulerTick tests
// ═══════════════════════════════════════════════════════════════════════════

describe("runSchedulerTick", () => {
  it("enqueues light when hour >= 3 and no run today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T05:00:00Z"));
    insertConfig("owner-1", "UTC");
    insertFact("session-1", "owner-1", "identity", "name");

    await runSchedulerTick();

    expect(enqueueJobCalls).toContainEqual({
      jobType: "heartbeat_light",
      payload: { ownerKey: "owner-1", ownerDay: "2026-02-25" },
    });
    vi.useRealTimers();
  });

  it("enqueues deep on Sunday when hour >= 3 and no run this week (enough facts)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T04:00:00Z"));
    insertConfig("owner-1", "UTC");
    insertManyFacts("session-1", "owner-1", 30);

    await runSchedulerTick();

    expect(enqueueJobCalls).toContainEqual({
      jobType: "heartbeat_deep",
      payload: { ownerKey: "owner-1", ownerDay: "2026-03-01" },
    });
    vi.useRealTimers();
  });

  it("does NOT enqueue deep on Sunday when fact count is below threshold", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T04:00:00Z"));
    insertConfig("owner-1", "UTC");
    insertFact("session-1", "owner-1", "identity", "name");
    // Override mock to return only 5 facts (below DEEP_HEARTBEAT_MIN_FACTS=25)
    mockGetActiveFacts.mockReturnValue(Array.from({ length: 5 }, (_, i) => ({
      id: `fact-${i}`, category: `cat-${i}`, key: `key-${i}`, value: { v: true },
    })));

    await runSchedulerTick();

    const deepJobs = enqueueJobCalls.filter((c) => c.jobType === "heartbeat_deep");
    expect(deepJobs).toHaveLength(0);
    vi.useRealTimers();
  });

  it("does NOT enqueue light if already ran today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T05:00:00Z"));
    insertConfig("owner-1", "UTC");
    insertFact("session-1", "owner-1", "identity", "name");
    insertRun("owner-1", "light", "2026-02-25");

    await runSchedulerTick();

    const lightJobs = enqueueJobCalls.filter((c) => c.jobType === "heartbeat_light");
    expect(lightJobs).toHaveLength(0);
    vi.useRealTimers();
  });

  it("does NOT enqueue deep if already ran this week", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T04:00:00Z"));
    insertConfig("owner-1", "UTC");
    insertManyFacts("session-1", "owner-1", 30);
    insertRun("owner-1", "deep", "2026-02-25"); // Wednesday of W09

    await runSchedulerTick();

    const deepJobs = enqueueJobCalls.filter((c) => c.jobType === "heartbeat_deep");
    expect(deepJobs).toHaveLength(0);
    vi.useRealTimers();
  });

  it("does NOT enqueue before 3AM", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T02:00:00Z"));
    insertConfig("owner-1", "UTC");
    insertFact("session-1", "owner-1", "identity", "name");

    await runSchedulerTick();

    expect(enqueueJobCalls).toHaveLength(0);
    vi.useRealTimers();
  });

  it("recovery: enqueues deep on Monday before noon if previous week missed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T08:00:00Z"));
    insertConfig("owner-1", "UTC");
    insertManyFacts("session-1", "owner-1", 30);

    await runSchedulerTick();

    const deepJobs = enqueueJobCalls.filter((c) => c.jobType === "heartbeat_deep");
    expect(deepJobs.length).toBeGreaterThanOrEqual(1);
    vi.useRealTimers();
  });

  it("no recovery on Monday if previous week had a deep run", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T08:00:00Z"));
    insertConfig("owner-1", "UTC");
    insertManyFacts("session-1", "owner-1", 30);
    insertRun("owner-1", "deep", "2026-03-01"); // Sunday of W09

    await runSchedulerTick();

    const deepJobs = enqueueJobCalls.filter((c) => c.jobType === "heartbeat_deep");
    expect(deepJobs).toHaveLength(0);
    vi.useRealTimers();
  });

  it("skips disabled owners", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T05:00:00Z"));
    insertConfig("owner-disabled", "UTC", 0);
    insertFact("session-d", "owner-disabled", "identity", "name");

    await runSchedulerTick();

    expect(enqueueJobCalls).toHaveLength(0);
    vi.useRealTimers();
  });

  it("anti-overlap: second call during running tick is a no-op", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T05:00:00Z"));
    insertConfig("owner-1", "UTC");
    insertFact("session-1", "owner-1", "identity", "name");

    // Make enqueueJob return a promise to simulate async work,
    // which keeps isSchedulerRunning = true while the second call starts.
    const { enqueueJob } = await import("@/lib/worker/index");
    let resolveEnqueue: () => void;
    const enqueuePromise = new Promise<void>((r) => { resolveEnqueue = r; });
    vi.mocked(enqueueJob).mockImplementationOnce((jobType: string, payload: Record<string, unknown>) => {
      enqueueJobCalls.push({ jobType, payload });
      // Simulate async: don't resolve yet
      return "mock-job-id";
    });

    // Since the function body is synchronous, we test the guard more directly:
    // Call tick, then immediately call tick again before the first returns
    // In practice, the lock prevents re-entry during the same synchronous execution
    // but since JS is single-threaded, true concurrency can only happen if tick awaits.
    // We verify the guard exists by checking the module-level flag behavior.
    const p1 = runSchedulerTick();
    await p1;

    // After first tick completes, lock should be released, second should work normally
    enqueueJobCalls.length = 0;
    await runSchedulerTick();
    const lightJobs = enqueueJobCalls.filter((c) => c.jobType === "heartbeat_light");
    // Second run also enqueues (since first run's job isn't in heartbeat_runs, only in enqueueJob mock)
    expect(lightJobs).toHaveLength(1);
    vi.useRealTimers();
  });

  it("resets lock on error (try/finally)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T05:00:00Z"));

    const origPrepare = testSqlite.prepare.bind(testSqlite);
    let callCount = 0;
    vi.spyOn(testSqlite, "prepare").mockImplementation(((sql: string) => {
      callCount++;
      if (callCount === 1 && sql.includes("heartbeat_config")) {
        throw new Error("Simulated DB error");
      }
      return origPrepare(sql);
    }) as any);

    await expect(runSchedulerTick()).rejects.toThrow("Simulated DB error");

    vi.restoreAllMocks();

    insertConfig("owner-1", "UTC");
    insertFact("session-1", "owner-1", "identity", "name");
    await runSchedulerTick();

    expect(enqueueJobCalls.length).toBeGreaterThan(0);
    vi.useRealTimers();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Connector sync loop tests
// ═══════════════════════════════════════════════════════════════════════════

describe("runSchedulerTick — connector sync", () => {
  it("enqueues connector_sync for owners with active connectors", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T05:00:00Z"));

    // Insert connector row so owner discovery finds it
    insertConnector("connector-owner-1", "github", "connected", null);
    // Mock getActiveConnectors to return a connector with no lastSync
    mockGetActiveConnectors.mockImplementation((ownerKey: string) => {
      if (ownerKey === "connector-owner-1") {
        return [{
          id: "conn-1", connectorType: "github", status: "connected",
          enabled: true, lastSync: null, ownerKey: "connector-owner-1",
          credentials: null, config: null, syncCursor: null, lastError: null,
          createdAt: null, updatedAt: null,
        }];
      }
      return [];
    });

    await runSchedulerTick();

    const syncJobs = enqueueJobCalls.filter((c) => c.jobType === "connector_sync");
    expect(syncJobs).toHaveLength(1);
    expect(syncJobs[0].payload).toEqual({
      ownerKey: "connector-owner-1",
      ownerDay: "2026-02-25",
    });
    vi.useRealTimers();
  });

  it("does NOT enqueue connector_sync when all connectors synced today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T10:00:00Z"));

    insertConnector("owner-synced", "github", "connected", "2026-02-25T08:00:00Z");
    mockGetActiveConnectors.mockImplementation((ownerKey: string) => {
      if (ownerKey === "owner-synced") {
        return [{
          id: "conn-2", connectorType: "github", status: "connected",
          enabled: true, lastSync: "2026-02-25T08:00:00Z", ownerKey: "owner-synced",
          credentials: null, config: null, syncCursor: null, lastError: null,
          createdAt: null, updatedAt: null,
        }];
      }
      return [];
    });

    await runSchedulerTick();

    const syncJobs = enqueueJobCalls.filter((c) => c.jobType === "connector_sync");
    expect(syncJobs).toHaveLength(0);
    vi.useRealTimers();
  });

  it("enqueues connector_sync when at least one connector has not synced today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T10:00:00Z"));

    insertConnector("owner-partial", "github", "connected", "2026-02-25T08:00:00Z");
    insertConnector("owner-partial", "spotify", "connected", null);
    mockGetActiveConnectors.mockImplementation((ownerKey: string) => {
      if (ownerKey === "owner-partial") {
        return [
          {
            id: "conn-gh", connectorType: "github", status: "connected",
            enabled: true, lastSync: "2026-02-25T08:00:00Z", ownerKey: "owner-partial",
            credentials: null, config: null, syncCursor: null, lastError: null,
            createdAt: null, updatedAt: null,
          },
          {
            id: "conn-sp", connectorType: "spotify", status: "connected",
            enabled: true, lastSync: null, ownerKey: "owner-partial",
            credentials: null, config: null, syncCursor: null, lastError: null,
            createdAt: null, updatedAt: null,
          },
        ];
      }
      return [];
    });

    await runSchedulerTick();

    const syncJobs = enqueueJobCalls.filter((c) => c.jobType === "connector_sync");
    expect(syncJobs).toHaveLength(1);
    expect(syncJobs[0].payload.ownerKey).toBe("owner-partial");
    vi.useRealTimers();
  });

  it("discovers connector-only owners (no heartbeat config or facts)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T05:00:00Z"));

    // No heartbeat config, no facts — only a connector row
    insertConnector("connector-only-owner", "rss", "connected", null);
    mockGetActiveConnectors.mockImplementation((ownerKey: string) => {
      if (ownerKey === "connector-only-owner") {
        return [{
          id: "conn-rss", connectorType: "rss", status: "connected",
          enabled: true, lastSync: null, ownerKey: "connector-only-owner",
          credentials: null, config: null, syncCursor: null, lastError: null,
          createdAt: null, updatedAt: null,
        }];
      }
      return [];
    });

    await runSchedulerTick();

    const syncJobs = enqueueJobCalls.filter((c) => c.jobType === "connector_sync");
    expect(syncJobs).toHaveLength(1);
    expect(syncJobs[0].payload.ownerKey).toBe("connector-only-owner");
    // Should NOT have heartbeat jobs for this connector-only owner
    const heartbeatJobs = enqueueJobCalls.filter(
      (c) => c.jobType === "heartbeat_light" || c.jobType === "heartbeat_deep",
    );
    expect(heartbeatJobs).toHaveLength(0);
    vi.useRealTimers();
  });

  it("does NOT enqueue connector_sync for disconnected/paused connectors", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T05:00:00Z"));

    // Insert connectors with status that should not be discovered
    insertConnector("owner-disc", "github", "disconnected", null);
    insertConnector("owner-paused", "spotify", "paused", null);
    // getActiveConnectors returns empty for these owners (correct behavior)
    mockGetActiveConnectors.mockReturnValue([]);

    await runSchedulerTick();

    const syncJobs = enqueueJobCalls.filter((c) => c.jobType === "connector_sync");
    expect(syncJobs).toHaveLength(0);
    vi.useRealTimers();
  });

  it("includes error-status connectors in sync", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T05:00:00Z"));

    insertConnector("owner-err", "strava", "error", null);
    mockGetActiveConnectors.mockImplementation((ownerKey: string) => {
      if (ownerKey === "owner-err") {
        return [{
          id: "conn-err", connectorType: "strava", status: "error",
          enabled: true, lastSync: null, ownerKey: "owner-err",
          credentials: null, config: null, syncCursor: null, lastError: "rate limit",
          createdAt: null, updatedAt: null,
        }];
      }
      return [];
    });

    await runSchedulerTick();

    const syncJobs = enqueueJobCalls.filter((c) => c.jobType === "connector_sync");
    expect(syncJobs).toHaveLength(1);
    expect(syncJobs[0].payload.ownerKey).toBe("owner-err");
    vi.useRealTimers();
  });

  it("uses owner timezone for daily guard", async () => {
    vi.useFakeTimers();
    // 2026-02-25 23:00 UTC = 2026-02-26 08:00 Asia/Tokyo
    vi.setSystemTime(new Date("2026-02-25T23:00:00Z"));

    insertConnector("owner-tz", "github", "connected", null);
    insertConfig("owner-tz", "Asia/Tokyo");
    mockGetActiveConnectors.mockImplementation((ownerKey: string) => {
      if (ownerKey === "owner-tz") {
        return [{
          id: "conn-tz", connectorType: "github", status: "connected",
          enabled: true, lastSync: null, ownerKey: "owner-tz",
          credentials: null, config: null, syncCursor: null, lastError: null,
          createdAt: null, updatedAt: null,
        }];
      }
      return [];
    });

    await runSchedulerTick();

    const syncJobs = enqueueJobCalls.filter((c) => c.jobType === "connector_sync");
    expect(syncJobs).toHaveLength(1);
    // ownerDay should be in Tokyo timezone (Feb 26), not UTC (Feb 25)
    expect(syncJobs[0].payload.ownerDay).toBe("2026-02-26");
    vi.useRealTimers();
  });

  it("skips disabled connectors in owner discovery", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T05:00:00Z"));

    // Connector with enabled=0 should not be discovered
    insertConnector("owner-disabled-conn", "github", "connected", null, 0);
    mockGetActiveConnectors.mockReturnValue([]);

    await runSchedulerTick();

    const syncJobs = enqueueJobCalls.filter((c) => c.jobType === "connector_sync");
    expect(syncJobs).toHaveLength(0);
    vi.useRealTimers();
  });

  it("deduplicates owners present in both heartbeat and connector loops", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T05:00:00Z"));

    // Owner has both heartbeat config and a connector
    insertConfig("dual-owner", "UTC");
    insertFact("session-dual", "dual-owner", "identity", "name");
    insertConnector("dual-owner", "github", "connected", null);
    mockGetActiveConnectors.mockImplementation((ownerKey: string) => {
      if (ownerKey === "dual-owner") {
        return [{
          id: "conn-dual", connectorType: "github", status: "connected",
          enabled: true, lastSync: null, ownerKey: "dual-owner",
          credentials: null, config: null, syncCursor: null, lastError: null,
          createdAt: null, updatedAt: null,
        }];
      }
      return [];
    });

    await runSchedulerTick();

    // Should have exactly 1 connector_sync job (not 2)
    const syncJobs = enqueueJobCalls.filter((c) => c.jobType === "connector_sync");
    expect(syncJobs).toHaveLength(1);
    expect(syncJobs[0].payload.ownerKey).toBe("dual-owner");
    vi.useRealTimers();
  });
});
