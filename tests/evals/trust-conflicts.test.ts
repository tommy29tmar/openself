/**
 * Tests for Sub-Phases 5+6: Trust Ledger, Conflict Service, Heartbeat Config.
 * Uses real DB (SQLite + auto-migrations on import).
 */
import { describe, it, expect } from "vitest";
import {
  logTrustAction,
  getTrustLedger,
  reverseTrustAction,
} from "@/lib/services/trust-ledger-service";
import {
  createConflict,
  getOpenConflicts,
  resolveConflict,
} from "@/lib/services/conflict-service";
import {
  getHeartbeatConfig,
  computeOwnerDay,
  checkOwnerBudget,
} from "@/lib/services/heartbeat-config-service";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

// ────────────────────────────────────────────────────────────
// Trust Ledger
// ────────────────────────────────────────────────────────────

describe("Trust Ledger", () => {
  it("logTrustAction creates entry with all fields", () => {
    const owner = `trust-all-fields-${randomUUID()}`;
    const id = logTrustAction(owner, "test_action", "Did a thing", {
      entityId: "ent-1",
      details: { foo: "bar" },
      undoPayload: { action: "reopen_conflict", conflictId: "c1" },
    });

    expect(id).toBeTruthy();
    const entries = getTrustLedger(owner);
    expect(entries).toHaveLength(1);

    const e = entries[0];
    expect(e.id).toBe(id);
    expect(e.ownerKey).toBe(owner);
    expect(e.actionType).toBe("test_action");
    expect(e.summary).toBe("Did a thing");
    expect(e.entityId).toBe("ent-1");
    expect(e.reversed).toBe(0);
    expect(e.reversedAt).toBeNull();
    expect(e.createdAt).toBeTruthy();
  });

  it("getTrustLedger returns entries ordered by recency", () => {
    const owner = `trust-order-${randomUUID()}`;
    const id1 = logTrustAction(owner, "a", "first");
    const id2 = logTrustAction(owner, "b", "second");
    const id3 = logTrustAction(owner, "c", "third");

    const entries = getTrustLedger(owner);
    expect(entries).toHaveLength(3);
    // Most recent first
    expect(entries[0].id).toBe(id3);
    expect(entries[2].id).toBe(id1);
  });

  it("getTrustLedger isolates by owner", () => {
    const ownerA = `trust-iso-a-${randomUUID()}`;
    const ownerB = `trust-iso-b-${randomUUID()}`;

    logTrustAction(ownerA, "x", "owner A action");
    logTrustAction(ownerB, "y", "owner B action");

    const entriesA = getTrustLedger(ownerA);
    const entriesB = getTrustLedger(ownerB);
    expect(entriesA).toHaveLength(1);
    expect(entriesB).toHaveLength(1);
    expect(entriesA[0].summary).toBe("owner A action");
    expect(entriesB[0].summary).toBe("owner B action");
  });

  it("reverseTrustAction with valid undo_payload succeeds", () => {
    const owner = `trust-undo-${randomUUID()}`;
    const conflictId = `conflict-undo-${randomUUID()}`;

    // Create a resolved conflict row so the undo (reopen) has something to act on
    sqlite
      .prepare(
        "INSERT INTO fact_conflicts(id, owner_key, fact_a_id, category, key, status, resolved_at) VALUES(?, ?, ?, 'test', 'k', 'resolved', datetime('now'))",
      )
      .run(conflictId, owner, `fa-${randomUUID()}`);

    // Log a trust action with reopen_conflict undo
    const entryId = logTrustAction(owner, "conflict_resolved", "Resolved it", {
      entityId: conflictId,
      undoPayload: { action: "reopen_conflict", conflictId },
    });

    const ok = reverseTrustAction(entryId, owner);
    expect(ok).toBe(true);

    // Conflict should be open again
    const row = sqlite
      .prepare("SELECT status FROM fact_conflicts WHERE id = ?")
      .get(conflictId) as { status: string };
    expect(row.status).toBe("open");

    // Trust entry should be marked reversed
    const entries = getTrustLedger(owner);
    const reversed = entries.find((e) => e.id === entryId);
    expect(reversed?.reversed).toBe(1);
    expect(reversed?.reversedAt).toBeTruthy();
  });

  it("reverseTrustAction on already-reversed entry returns false", () => {
    const owner = `trust-double-${randomUUID()}`;
    const conflictId = `conflict-double-${randomUUID()}`;

    sqlite
      .prepare(
        "INSERT INTO fact_conflicts(id, owner_key, fact_a_id, category, key, status, resolved_at) VALUES(?, ?, ?, 'test', 'k', 'resolved', datetime('now'))",
      )
      .run(conflictId, owner, `fa-${randomUUID()}`);

    const entryId = logTrustAction(owner, "conflict_resolved", "Resolved", {
      undoPayload: { action: "reopen_conflict", conflictId },
    });

    // First reverse succeeds
    expect(reverseTrustAction(entryId, owner)).toBe(true);
    // Second reverse fails (no double-undo)
    expect(reverseTrustAction(entryId, owner)).toBe(false);
  });

  it("reverseTrustAction on entry with no undo_payload throws", () => {
    const owner = `trust-no-undo-${randomUUID()}`;
    const entryId = logTrustAction(owner, "irreversible", "No undo");

    expect(() => reverseTrustAction(entryId, owner)).toThrow(
      /not reversible/i,
    );
  });
});

// ────────────────────────────────────────────────────────────
// Fact Conflicts
// ────────────────────────────────────────────────────────────

describe("Fact Conflicts", () => {
  it("createConflict creates open conflict", () => {
    const owner = `conflict-open-${randomUUID()}`;
    const factA = `fa-${randomUUID()}`;
    const factB = `fb-${randomUUID()}`;

    const c = createConflict(owner, factA, factB, "identity", "name", "chat", "connector");
    expect(c).not.toBeNull();
    expect(c!.status).toBe("open");
    expect(c!.ownerKey).toBe(owner);
    expect(c!.factAId).toBe(factA);
    expect(c!.factBId).toBe(factB);
    expect(c!.category).toBe("identity");
    expect(c!.key).toBe("name");
    expect(c!.sourceA).toBe("chat");
    expect(c!.sourceB).toBe("connector");
    expect(c!.resolution).toBeNull();
    expect(c!.resolvedAt).toBeNull();
  });

  it("createConflict returns null when source precedence diff >= 2", () => {
    const owner = `conflict-skip-${randomUUID()}`;
    // user_explicit=4, heartbeat=1 -> diff=3 >= 2 -> auto-skip
    const c = createConflict(
      owner,
      `fa-${randomUUID()}`,
      `fb-${randomUUID()}`,
      "identity",
      "job",
      "user_explicit",
      "heartbeat",
    );
    expect(c).toBeNull();
  });

  it("getOpenConflicts returns only open conflicts for owner", () => {
    const owner = `conflict-list-${randomUUID()}`;
    const factA = `fa-${randomUUID()}`;
    const factB = `fb-${randomUUID()}`;

    // Create two open conflicts (chat vs connector -> diff=1, within threshold)
    createConflict(owner, factA, factB, "identity", "name", "chat", "connector");
    createConflict(owner, `fa2-${randomUUID()}`, `fb2-${randomUUID()}`, "skill", "lang", "chat", "connector");

    // Create a resolved one via direct SQL
    const resolvedId = randomUUID();
    sqlite
      .prepare(
        "INSERT INTO fact_conflicts(id, owner_key, fact_a_id, category, key, status, resolved_at) VALUES(?, ?, ?, 'test', 'k', 'resolved', datetime('now'))",
      )
      .run(resolvedId, owner, `fa-${randomUUID()}`);

    const open = getOpenConflicts(owner);
    expect(open).toHaveLength(2);
    expect(open.every((c) => c.status === "open")).toBe(true);
    expect(open.every((c) => c.ownerKey === owner)).toBe(true);
  });

  it("resolveConflict keep_a deletes fact B", () => {
    const owner = `conflict-keepa-${randomUUID()}`;
    const factAId = `fa-keepa-${randomUUID()}`;
    const factBId = `fb-keepa-${randomUUID()}`;

    // Create session first (facts.session_id FK requires it)
    const sessionId = `sess-${randomUUID()}`;
    sqlite
      .prepare("INSERT INTO sessions(id, invite_code) VALUES(?, 'test')")
      .run(sessionId);
    sqlite
      .prepare(
        "INSERT INTO facts(id, session_id, category, key, value) VALUES(?, ?, 'test', 'keyA', '{}')",
      )
      .run(factAId, sessionId);
    sqlite
      .prepare(
        "INSERT INTO facts(id, session_id, category, key, value) VALUES(?, ?, 'test', 'keyB', '{}')",
      )
      .run(factBId, sessionId);

    // Create conflict between them (chat vs connector -> diff=1)
    const c = createConflict(owner, factAId, factBId, "test", "val", "chat", "connector");
    expect(c).not.toBeNull();

    const result = resolveConflict(c!.id, owner, "keep_a");
    expect(result.success).toBe(true);

    // Fact A still exists
    const a = sqlite.prepare("SELECT id FROM facts WHERE id = ?").get(factAId);
    expect(a).toBeTruthy();

    // Fact B deleted
    const b = sqlite.prepare("SELECT id FROM facts WHERE id = ?").get(factBId);
    expect(b).toBeUndefined();
  });

  it("reverseTrustAction restores facts after merge resolution", () => {
    const owner = `conflict-merge-${randomUUID()}`;
    const factAId = `fa-merge-${randomUUID()}`;
    const factBId = `fb-merge-${randomUUID()}`;
    const sessionId = `sess-${randomUUID()}`;

    sqlite
      .prepare("INSERT INTO sessions(id, invite_code) VALUES(?, 'test')")
      .run(sessionId);
    sqlite
      .prepare(
        "INSERT INTO facts(id, session_id, category, key, value) VALUES(?, ?, 'test', 'keyA-merge', ?)",
      )
      .run(factAId, sessionId, '{"label":"alpha"}');
    sqlite
      .prepare(
        "INSERT INTO facts(id, session_id, category, key, value) VALUES(?, ?, 'test', 'keyB-merge', ?)",
      )
      .run(factBId, sessionId, '{"label":"beta"}');

    const c = createConflict(owner, factAId, factBId, "test", "merge-key", "chat", "connector");
    expect(c).not.toBeNull();

    const result = resolveConflict(c!.id, owner, "merge", { label: "merged" });
    expect(result.success).toBe(true);

    const ledgerEntry = getTrustLedger(owner).find((entry) => entry.entityId === c!.id);
    expect(ledgerEntry).toBeTruthy();
    expect(reverseTrustAction(ledgerEntry!.id, owner)).toBe(true);

    const conflictRow = sqlite
      .prepare("SELECT status, resolution FROM fact_conflicts WHERE id = ?")
      .get(c!.id) as { status: string; resolution: string | null };
    expect(conflictRow.status).toBe("open");
    expect(conflictRow.resolution).toBeNull();

    const factA = sqlite
      .prepare("SELECT value FROM facts WHERE id = ?")
      .get(factAId) as { value: string };
    const factB = sqlite
      .prepare("SELECT value FROM facts WHERE id = ?")
      .get(factBId) as { value: string };
    expect(factA.value).toBe('{"label":"alpha"}');
    expect(factB.value).toBe('{"label":"beta"}');
  });

  it("resolveConflict on already-resolved conflict returns error", () => {
    const owner = `conflict-dup-${randomUUID()}`;
    const factAId = `fa-dup-${randomUUID()}`;
    const factBId = `fb-dup-${randomUUID()}`;

    const sessionId = `sess-${randomUUID()}`;
    sqlite
      .prepare("INSERT INTO sessions(id, invite_code) VALUES(?, 'test')")
      .run(sessionId);
    sqlite
      .prepare(
        "INSERT INTO facts(id, session_id, category, key, value) VALUES(?, ?, 'test', 'keyA2', '{}')",
      )
      .run(factAId, sessionId);
    sqlite
      .prepare(
        "INSERT INTO facts(id, session_id, category, key, value) VALUES(?, ?, 'test', 'keyB2', '{}')",
      )
      .run(factBId, sessionId);

    const c = createConflict(owner, factAId, factBId, "test", "v", "chat", "connector");
    expect(c).not.toBeNull();

    // First resolution
    const r1 = resolveConflict(c!.id, owner, "keep_a");
    expect(r1.success).toBe(true);

    // Second resolution on same conflict
    const r2 = resolveConflict(c!.id, owner, "keep_a");
    expect(r2.success).toBe(false);
    expect(r2.error).toMatch(/already resolved/i);
  });

  it("resolveConflict creates trust ledger entry", () => {
    const owner = `conflict-trust-${randomUUID()}`;
    const factAId = `fa-trust-${randomUUID()}`;

    const sessionId = `sess-${randomUUID()}`;
    sqlite
      .prepare("INSERT INTO sessions(id, invite_code) VALUES(?, 'test')")
      .run(sessionId);
    sqlite
      .prepare(
        "INSERT INTO facts(id, session_id, category, key, value) VALUES(?, ?, 'test', 'keyT', '{}')",
      )
      .run(factAId, sessionId);

    const c = createConflict(owner, factAId, null, "test", "x", "chat", "connector");
    expect(c).not.toBeNull();

    resolveConflict(c!.id, owner, "dismissed");

    const ledger = getTrustLedger(owner);
    expect(ledger.length).toBeGreaterThanOrEqual(1);

    const entry = ledger.find((e) => e.entityId === c!.id);
    expect(entry).toBeTruthy();
    expect(entry!.actionType).toBe("conflict_resolved");
    expect(entry!.summary).toContain("dismissed");
  });
});

// ────────────────────────────────────────────────────────────
// Heartbeat Config
// ────────────────────────────────────────────────────────────

describe("Heartbeat Config", () => {
  it("getHeartbeatConfig returns defaults when no row exists", () => {
    const owner = `hb-defaults-${randomUUID()}`;
    const cfg = getHeartbeatConfig(owner);

    expect(cfg.ownerKey).toBe(owner);
    expect(cfg.lightBudgetDailyUsd).toBe(0.1);
    expect(cfg.deepBudgetDailyUsd).toBe(0.25);
    expect(cfg.timezone).toBe("UTC");
    expect(cfg.lightIntervalHours).toBe(24);
    expect(cfg.deepIntervalHours).toBe(168);
    expect(cfg.enabled).toBe(1);
  });

  it("computeOwnerDay returns YYYY-MM-DD format string", () => {
    const day = computeOwnerDay("UTC");
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("checkOwnerBudget returns allowed:true when no runs exist", () => {
    const owner = `hb-budget-${randomUUID()}`;
    const cfg = getHeartbeatConfig(owner);
    const result = checkOwnerBudget(owner, "light", cfg);

    expect(result.allowed).toBe(true);
    expect(result.spent).toBe(0);
    expect(result.limit).toBe(0.1);
  });
});
