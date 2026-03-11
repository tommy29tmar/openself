// src/lib/services/episodic-service.ts
import { randomUUID } from "crypto";
import { sqlite } from "@/lib/db";
import { logEvent } from "@/lib/services/event-service";
import { validateFactValue } from "@/lib/services/fact-validation";
import { initialVisibility } from "@/lib/visibility/policy";

export type EpisodicEventRow = {
  id: string; ownerKey: string; sessionId: string; sourceMessageId: string | null;
  deviceId: string | null; eventAtUnix: number; eventAtHuman: string;
  actionType: string; narrativeSummary: string; rawInput: string | null;
  entities: unknown[]; visibility: string; confidence: number;
  supersededBy: string | null; archived: number; archivedAt: string | null; createdAt: string | null;
};

export type InsertEventInput = {
  ownerKey: string; sessionId: string; sourceMessageId?: string; deviceId?: string;
  eventAtUnix: number; eventAtHuman: string; actionType: string;
  narrativeSummary: string; rawInput?: string; entities?: unknown[];
  source?: string; // 'chat' (default), 'github', 'linkedin', etc.
  externalId?: string; // stable connector dedup key
};

export type EpisodicProposalRow = {
  id: string; ownerKey: string; actionType: string; patternSummary: string;
  eventCount: number; lastEventAtUnix: number; status: string; expiresAt: string;
  resolvedAt: string | null; rejectionCooldownUntil: string | null; createdAt: string | null;
};

type AcceptProposalResult = {
  factId: string;
  factKey: string;
};

// --- Context injection ---

const CONTEXT_WINDOW_DAYS = 30;
const CHAT_SOURCE_CAP = 10;
const CONNECTOR_SOURCE_CAP = 3;
const TOTAL_CONTEXT_CAP = 15;

export type EpisodicContextEvent = {
  eventAtUnix: number;
  eventAtHuman: string;
  actionType: string;
  narrativeSummary: string;
  source: string;
};

/**
 * Source-weighted episodic events for LLM context injection.
 * 30-day window, per-source caps (chat: 10, per-connector: 3), total cap 15.
 */
export function getRecentEventsForContext(ownerKey: string): EpisodicContextEvent[] {
  const cutoffUnix = Math.floor(Date.now() / 1000) - CONTEXT_WINDOW_DAYS * 86400;

  const sources = sqlite
    .prepare(
      `SELECT DISTINCT COALESCE(source, 'chat') AS source
       FROM episodic_events
       WHERE owner_key = ? AND event_at_unix >= ?
         AND superseded_by IS NULL AND archived = 0`,
    )
    .all(ownerKey, cutoffUnix) as Array<{ source: string }>;

  const buckets: EpisodicContextEvent[] = [];
  for (const { source: src } of sources) {
    const cap = src === "chat" ? CHAT_SOURCE_CAP : CONNECTOR_SOURCE_CAP;
    const rows = sqlite
      .prepare(
        `SELECT event_at_unix, event_at_human, action_type, narrative_summary, COALESCE(source, 'chat') AS source
         FROM episodic_events
         WHERE owner_key = ? AND event_at_unix >= ?
           AND superseded_by IS NULL AND archived = 0
           AND COALESCE(source, 'chat') = ?
         ORDER BY event_at_unix DESC
         LIMIT ?`,
      )
      .all(ownerKey, cutoffUnix, src, cap) as Array<{
        event_at_unix: number;
        event_at_human: string;
        action_type: string;
        narrative_summary: string;
        source: string;
      }>;

    for (const row of rows) {
      buckets.push({
        eventAtUnix: row.event_at_unix,
        eventAtHuman: row.event_at_human,
        actionType: row.action_type,
        narrativeSummary: row.narrative_summary,
        source: row.source,
      });
    }
  }

  buckets.sort((a, b) => b.eventAtUnix - a.eventAtUnix);
  return buckets.slice(0, TOTAL_CONTEXT_CAP);
}

// --- Event CRUD ---

export function insertEvent(input: InsertEventInput): string {
  const id = randomUUID();
  sqlite.prepare(`
    INSERT INTO episodic_events
      (id, owner_key, session_id, source_message_id, device_id,
       event_at_unix, event_at_human, action_type, narrative_summary, raw_input, entities,
       source, external_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.ownerKey, input.sessionId,
    input.sourceMessageId ?? null, input.deviceId ?? null,
    input.eventAtUnix, input.eventAtHuman, input.actionType,
    input.narrativeSummary, input.rawInput ?? null,
    JSON.stringify(input.entities ?? []),
    input.source ?? "chat", input.externalId ?? null,
  );
  return id;
}

export function supersedeEvent(oldId: string, newId: string): void {
  sqlite.prepare("UPDATE episodic_events SET superseded_by = ? WHERE id = ?").run(newId, oldId);
}

export function deleteEvent(id: string): void {
  sqlite.prepare("UPDATE episodic_events SET superseded_by = 'deleted' WHERE id = ?").run(id);
}

// --- Queries ---

export type QueryEventsInput = {
  ownerKey: string; fromUnix: number; toUnix: number;
  actionType?: string; keywords?: string; limit?: number;
};

/** Sanitize keywords for FTS5 MATCH: phrase-quote to prevent parse errors on C++, (, -, etc. */
function sanitizeFtsKeywords(raw: string): string {
  return `"${raw.trim().replace(/"/g, "")}"`;
}

export function queryEvents(input: QueryEventsInput): EpisodicEventRow[] {
  const limit = Math.min(input.limit ?? 10, 20);
  if (input.keywords && input.keywords.trim().length > 0) {
    const safeFts = sanitizeFtsKeywords(input.keywords);
    try {
      const rows = sqlite.prepare(`
        SELECT e.* FROM episodic_events e
        JOIN episodic_events_fts fts ON fts.rowid = e.rowid
        WHERE e.owner_key = ? AND e.event_at_unix BETWEEN ? AND ?
          AND e.superseded_by IS NULL AND e.archived = 0
          ${input.actionType ? "AND e.action_type = ?" : ""}
          AND episodic_events_fts MATCH ?
        ORDER BY e.event_at_unix DESC LIMIT ?
      `).all(...[
        input.ownerKey, input.fromUnix, input.toUnix,
        ...(input.actionType ? [input.actionType] : []),
        safeFts, limit,
      ]) as any[];
      return rows.map(toRow);
    } catch {
      // Fallback to LIKE on FTS parse error
      const likePattern = `%${input.keywords.replace(/[%_]/g, "\\$&")}%`;
      const rows = sqlite.prepare(`
        SELECT * FROM episodic_events
        WHERE owner_key = ? AND event_at_unix BETWEEN ? AND ?
          AND superseded_by IS NULL AND archived = 0
          ${input.actionType ? "AND action_type = ?" : ""}
          AND narrative_summary LIKE ? ESCAPE '\\'
        ORDER BY event_at_unix DESC LIMIT ?
      `).all(...[
        input.ownerKey, input.fromUnix, input.toUnix,
        ...(input.actionType ? [input.actionType] : []),
        likePattern, limit,
      ]) as any[];
      return rows.map(toRow);
    }
  }
  const rows = sqlite.prepare(`
    SELECT * FROM episodic_events
    WHERE owner_key = ? AND event_at_unix BETWEEN ? AND ?
      AND superseded_by IS NULL AND archived = 0
      ${input.actionType ? "AND action_type = ?" : ""}
    ORDER BY event_at_unix DESC LIMIT ?
  `).all(...[
    input.ownerKey, input.fromUnix, input.toUnix,
    ...(input.actionType ? [input.actionType] : []),
    limit,
  ]) as any[];
  return rows.map(toRow);
}

/** Aggregate count by action_type for all matching events (no limit). Used for non-keyword recall. */
export function countEventsByType(
  ownerKey: string, fromUnix: number, toUnix: number, actionType?: string,
): Record<string, number> {
  const rows = sqlite.prepare(`
    SELECT action_type, COUNT(*) as cnt
    FROM episodic_events
    WHERE owner_key = ? AND event_at_unix BETWEEN ? AND ?
      AND superseded_by IS NULL AND archived = 0
      ${actionType ? "AND action_type = ?" : ""}
    GROUP BY action_type
  `).all(...[
    ownerKey, fromUnix, toUnix,
    ...(actionType ? [actionType] : []),
  ]) as Array<{ action_type: string; cnt: number }>;
  return Object.fromEntries(rows.map(r => [r.action_type, r.cnt]));
}

/**
 * Count keyword-matching events (for keyword-path truncation detection in recall_episodes).
 * Mirrors queryEvents keyword logic but returns COUNT instead of rows.
 * Returns 0 on FTS parse error (caller should use events.length as fallback).
 */
export function countKeywordEvents(input: Omit<QueryEventsInput, 'limit'>): number {
  if (!input.keywords || !input.keywords.trim()) return 0;
  const safeFts = sanitizeFtsKeywords(input.keywords);
  try {
    const result = sqlite.prepare(`
      SELECT COUNT(*) as cnt FROM episodic_events e
      JOIN episodic_events_fts fts ON fts.rowid = e.rowid
      WHERE e.owner_key = ? AND e.event_at_unix BETWEEN ? AND ?
        AND e.superseded_by IS NULL AND e.archived = 0
        ${input.actionType ? "AND e.action_type = ?" : ""}
        AND episodic_events_fts MATCH ?
    `).get(...[
      input.ownerKey, input.fromUnix, input.toUnix,
      ...(input.actionType ? [input.actionType] : []),
      safeFts,
    ]) as { cnt: number } | undefined;
    return result?.cnt ?? 0;
  } catch {
    return 0; // FTS parse error — caller uses events.length
  }
}

export function archiveOldEvents(ownerKey: string, cutoffUnix: number): number {
  const result = sqlite.prepare(`
    UPDATE episodic_events SET archived = 1, archived_at = datetime('now')
    WHERE owner_key = ? AND event_at_unix < ? AND superseded_by IS NULL AND archived = 0
  `).run(ownerKey, cutoffUnix);
  return result.changes;
}

// --- Proposals ---

const PROPOSAL_TTL_DAYS = 30;
const REJECTION_COOLDOWN_DAYS = 90;
const ACCEPTED_PATTERN_CATEGORY = "activity";
const ACCEPTED_PATTERN_FREQUENCY = "regularly";

export function insertEpisodicProposal(input: {
  ownerKey: string; actionType: string; patternSummary: string;
  eventCount: number; lastEventAtUnix: number;
}): string {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + PROPOSAL_TTL_DAYS * 86400_000).toISOString();
  sqlite.prepare(`
    INSERT INTO episodic_pattern_proposals
      (id, owner_key, action_type, pattern_summary, event_count, last_event_at_unix, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.ownerKey, input.actionType, input.patternSummary,
         input.eventCount, input.lastEventAtUnix, expiresAt);
  return id;
}

export function getPendingEpisodicProposals(ownerKey: string): EpisodicProposalRow[] {
  sqlite.prepare(`
    UPDATE episodic_pattern_proposals SET status = 'expired', resolved_at = datetime('now')
    WHERE owner_key = ? AND status = 'pending'
      AND julianday(expires_at) < julianday('now')
  `).run(ownerKey);
  return (sqlite.prepare(`
    SELECT * FROM episodic_pattern_proposals
    WHERE owner_key = ? AND status = 'pending' ORDER BY created_at ASC
  `).all(ownerKey) as any[]).map(toProposalRow);
}

export function getEpisodicProposalById(id: string): EpisodicProposalRow | null {
  const row = sqlite.prepare("SELECT * FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
  return row ? toProposalRow(row) : null;
}

/**
 * Resolves a proposal. Returns false if: owner mismatch, already resolved, or expired.
 * R5-4 fix: expiry check in SQL prevents accepting expired proposals even if status is still 'pending'.
 */
export function resolveEpisodicProposal(id: string, ownerKey: string, accept: boolean): boolean {
  const cooldownUntil = accept
    ? null
    : new Date(Date.now() + REJECTION_COOLDOWN_DAYS * 86400_000).toISOString();
  const status = accept ? "accepted" : "rejected";
  const result = sqlite.prepare(`
    UPDATE episodic_pattern_proposals
    SET status = ?, resolved_at = datetime('now'), rejection_cooldown_until = ?
    WHERE id = ? AND owner_key = ? AND status = 'pending'
      AND julianday(expires_at) >= julianday('now')
  `).run(status, cooldownUntil, id, ownerKey);
  return result.changes === 1;
}

export function acceptEpisodicProposalAsActivity(
  id: string,
  ownerKey: string,
  sessionId: string,
  profileId: string = sessionId,
): AcceptProposalResult | null {
  const now = new Date().toISOString();
  const visibility = initialVisibility({
    mode: "onboarding",
    category: ACCEPTED_PATTERN_CATEGORY,
    confidence: 1.0,
  });

  const result = sqlite.transaction(() => {
    const proposal = sqlite.prepare(`
      SELECT action_type, pattern_summary
      FROM episodic_pattern_proposals
      WHERE id = ? AND owner_key = ? AND status = 'pending'
        AND julianday(expires_at) >= julianday('now')
    `).get(id, ownerKey) as { action_type: string; pattern_summary: string } | undefined;

    if (!proposal) return null;

    const factKey = `habit_${proposal.action_type}`;
    const factValue = buildAcceptedActivityValue(proposal.action_type, proposal.pattern_summary);
    validateFactValue(ACCEPTED_PATTERN_CATEGORY, factKey, factValue);

    const claim = sqlite.prepare(`
      UPDATE episodic_pattern_proposals
      SET status = 'accepted', resolved_at = datetime('now'), rejection_cooldown_until = NULL
      WHERE id = ? AND owner_key = ? AND status = 'pending'
        AND julianday(expires_at) >= julianday('now')
    `).run(id, ownerKey);

    if (claim.changes !== 1) return null;

    const existing = sqlite.prepare(`
      SELECT id, sort_order
      FROM facts
      WHERE session_id = ? AND category = ? AND key = ?
    `).get(sessionId, ACCEPTED_PATTERN_CATEGORY, factKey) as
      | { id: string; sort_order: number | null }
      | undefined;

    const maxSortRow = sqlite.prepare(`
      SELECT MAX(sort_order) as max_sort
      FROM facts
      WHERE session_id = ? AND category = ? AND archived_at IS NULL
    `).get(sessionId, ACCEPTED_PATTERN_CATEGORY) as { max_sort: number | null } | undefined;

    const factId = existing?.id ?? randomUUID();
    const sortOrder = existing?.sort_order ?? ((maxSortRow?.max_sort ?? -1) + 1);

    sqlite.prepare(`
      INSERT INTO facts
        (id, session_id, profile_id, category, key, value, source, confidence, visibility,
         created_at, updated_at, sort_order, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(session_id, category, key) DO UPDATE SET
        value = excluded.value,
        source = excluded.source,
        confidence = excluded.confidence,
        profile_id = excluded.profile_id,
        visibility = CASE
          WHEN facts.visibility = 'private' THEN excluded.visibility
          ELSE facts.visibility
        END,
        updated_at = excluded.updated_at,
        archived_at = NULL
    `).run(
      factId,
      sessionId,
      profileId,
      ACCEPTED_PATTERN_CATEGORY,
      factKey,
      JSON.stringify(factValue),
      "chat",
      1.0,
      visibility,
      now,
      now,
      sortOrder,
    );

    return { factId, factKey };
  })();

  if (!result) return null;

  try {
    logEvent({
      eventType: "fact_created",
      actor: "assistant",
      payload: {
        category: ACCEPTED_PATTERN_CATEGORY,
        key: result.factKey,
        normalization: "known",
        rawCategory: ACCEPTED_PATTERN_CATEGORY,
      },
      entityType: "fact",
      entityId: result.factId,
    });
  } catch {
    // Audit failure must not roll back an accepted proposal.
  }

  return result;
}

export function isActionTypeOnCooldown(ownerKey: string, actionType: string): boolean {
  const row = sqlite.prepare(`
    SELECT rejection_cooldown_until FROM episodic_pattern_proposals
    WHERE owner_key = ? AND action_type = ? AND status = 'rejected'
      AND rejection_cooldown_until IS NOT NULL
    ORDER BY resolved_at DESC LIMIT 1
  `).get(ownerKey, actionType) as { rejection_cooldown_until: string } | undefined;
  if (!row) return false;
  const checkRow = sqlite.prepare(
    "SELECT julianday(?) > julianday('now') as active"
  ).get(row.rejection_cooldown_until) as { active: number } | undefined;
  return (checkRow?.active ?? 0) === 1;
}

function toRow(r: any): EpisodicEventRow {
  return {
    id: r.id, ownerKey: r.owner_key, sessionId: r.session_id,
    sourceMessageId: r.source_message_id, deviceId: r.device_id,
    eventAtUnix: r.event_at_unix, eventAtHuman: r.event_at_human,
    actionType: r.action_type, narrativeSummary: r.narrative_summary,
    rawInput: r.raw_input, entities: r.entities ? JSON.parse(r.entities) : [],
    visibility: r.visibility, confidence: r.confidence,
    supersededBy: r.superseded_by, archived: r.archived,
    archivedAt: r.archived_at, createdAt: r.created_at,
  };
}

function toProposalRow(r: any): EpisodicProposalRow {
  return {
    id: r.id, ownerKey: r.owner_key, actionType: r.action_type,
    patternSummary: r.pattern_summary, eventCount: r.event_count,
    lastEventAtUnix: r.last_event_at_unix, status: r.status,
    expiresAt: r.expires_at, resolvedAt: r.resolved_at,
    rejectionCooldownUntil: r.rejection_cooldown_until, createdAt: r.created_at,
  };
}

function buildAcceptedActivityValue(actionType: string, patternSummary: string): Record<string, unknown> {
  const value: Record<string, unknown> = {
    name: humanizeActionType(actionType),
    frequency: ACCEPTED_PATTERN_FREQUENCY,
    description: patternSummary,
  };
  if (actionType === "workout") value.activityType = "sport";
  return value;
}

function humanizeActionType(actionType: string): string {
  return actionType
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
