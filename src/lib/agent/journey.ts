// src/lib/agent/journey.ts

/**
 * Journey Intelligence — deterministic, zero-LLM detection layer.
 *
 * Detects where the user is in their journey (state), what's happening (situations),
 * and how experienced they are (expertise level). All detection is synchronous
 * and runs before the LLM sees anything.
 */

import { sqlite } from "@/lib/db";
import { countFacts, getActiveFacts, type FactRow } from "@/lib/services/kb-service";
import { hasAnyPublishedPage, getDraft, getPublishedUsername } from "@/lib/services/page-service";
import { getActiveSoul, proposeSoulChange, getPendingProposals } from "@/lib/services/soul-service";
import { getOpenConflicts, type ConflictRow } from "@/lib/services/conflict-service";
import { createProposalService } from "@/lib/services/proposal-service";
import { classifySectionRichness } from "@/lib/services/section-richness";
import { filterPublishableFacts } from "@/lib/services/page-projection";
import { SECTION_FACT_CATEGORIES } from "@/lib/services/personalization-hashing";
import type { OwnerScope } from "@/lib/auth/session";
import type { AuthInfo } from "@/lib/agent/context";
import { AUTH_MESSAGE_LIMIT } from "@/lib/constants";
import { detectArchetypeFromSignals, refineArchetype, ARCHETYPE_STRATEGIES, type Archetype } from "@/lib/agent/archetypes";
import { getSessionMeta, mergeSessionMeta } from "@/lib/services/session-metadata";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JourneyState =
  | "first_visit"
  | "returning_no_page"
  | "draft_ready"
  | "active_fresh"
  | "active_stale"
  | "blocked";

export type Situation =
  | "has_pending_proposals"
  | "has_thin_sections"
  | "has_stale_facts"
  | "has_open_conflicts"
  | "has_name"
  | "has_soul"
  | "has_archivable_facts"
  | "has_recent_import";

export type ExpertiseLevel = "novice" | "familiar" | "expert";

export interface BootstrapPayload {
  journeyState: JourneyState;
  situations: Situation[];
  expertiseLevel: ExpertiseLevel;
  userName: string | null;
  lastSeenDaysAgo: number | null;
  publishedUsername: string | null;
  pendingProposalCount: number;
  thinSections: string[];
  staleFacts: string[];
  openConflicts: string[];
  archivableFacts: string[];
  language: string;
  conversationContext: string | null;
  archetype: Archetype;
  importGapReport?: import("@/lib/connectors/import-gap-analyzer").ImportGapReport;
}

/**
 * Shared data collected during bootstrap, passed to assembleContext
 * to avoid duplicate DB queries. Pure optimization — same data, fewer reads.
 */
export interface BootstrapData {
  facts: FactRow[];
  soul: { compiled: string | null } | null;
  openConflictRecords: ConflictRow[];
  publishableFacts: FactRow[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Facts older than this are considered stale. */
const STALE_FACT_DAYS = 30;

/** Published page updated more recently than this is "fresh". */
const FRESH_PAGE_DAYS = 7;

/** Relevance threshold below which a fact is considered archivable. */
const ARCHIVABLE_RELEVANCE_THRESHOLD = 0.3;

/** Minimum active facts to keep — never suggest archival below this floor. */
const ARCHIVABLE_SAFETY_FLOOR = 5;

/**
 * Recency factor for relevance scoring.
 * <30d: 1.0, 30-90d: 0.7, 90-180d: 0.4, >180d: 0.2
 * @internal Exported for testing — not part of the public API.
 */
export function recencyFactor(updatedAt: string | null): number {
  if (!updatedAt) return 0.2;
  const days = daysBetween(new Date(updatedAt), new Date());
  if (days < 30) return 1.0;
  if (days < 90) return 0.7;
  if (days < 180) return 0.4;
  return 0.2;
}

/**
 * Compute relevance score for a fact.
 * Used by both detectSituations (flag) and assembleBootstrapPayload (list).
 * Single source of truth for the relevance formula.
 * @internal Exported for testing — not part of the public API.
 */
export function computeRelevance(f: FactRow, childCountMap?: Map<string, number>): number {
  const recency = recencyFactor(f.updatedAt);
  const children = childCountMap?.get(f.id) ?? 0;
  return (f.confidence ?? 1.0) * recency * (1 + children * 0.1);
}

// ---------------------------------------------------------------------------
// Detection: Journey State
// ---------------------------------------------------------------------------

/**
 * Deterministic priority chain:
 * blocked > active_fresh > active_stale > draft_ready > returning_no_page > first_visit
 */
export function detectJourneyState(
  scope: OwnerScope,
  authInfo?: AuthInfo,
): JourneyState {
  const readKeys = scope.knowledgeReadKeys;
  const factCount = countFacts(readKeys);
  const hasPublished = hasAnyPublishedPage(readKeys);

  // Blocked: quota exhausted (authenticated users only — anonymous handled by session-service).
  // We check if the profile is at/over the quota limit.
  if (authInfo?.authenticated) {
    const row = sqlite
      .prepare(
        "SELECT count FROM profile_message_usage WHERE profile_key = ?",
      )
      .get(scope.cognitiveOwnerKey) as { count: number } | undefined;
    if (row && row.count >= AUTH_MESSAGE_LIMIT) {
      return "blocked";
    }
  }

  // Active states: has a published page
  if (hasPublished) {
    const publishedUpdatedAt = getPublishedUpdatedAt(readKeys);
    if (publishedUpdatedAt) {
      const daysSinceUpdate = daysBetween(new Date(publishedUpdatedAt), new Date());
      if (daysSinceUpdate <= FRESH_PAGE_DAYS) {
        return "active_fresh";
      }
      return "active_stale";
    }
    // Published exists but no updatedAt — treat as stale
    return "active_stale";
  }

  // Draft ready: has a draft row (not published)
  const draft = getDraft(scope.knowledgePrimaryKey);
  if (draft) {
    return "draft_ready";
  }

  // Returning: has facts but no draft and no published page
  if (factCount > 0) {
    return "returning_no_page";
  }

  // Check for prior conversation (messages exist but no facts yet)
  if (getDistinctSessionCount(readKeys) > 0) {
    return "returning_no_page";
  }

  return "first_visit";
}

// ---------------------------------------------------------------------------
// Cached detection: pin state per session to prevent mid-conversation flips
// ---------------------------------------------------------------------------

/**
 * Get the journey state, using a per-session pin to prevent mid-conversation
 * mode flips (e.g. first_visit → draft_ready after recomposeAfterMutation).
 *
 * Safety override: blocked always wins, even over a cached pin.
 * The state is read/written on the anchor session (knowledgePrimaryKey).
 */
export function getOrDetectJourneyState(
  scope: OwnerScope,
  authInfo?: AuthInfo,
): JourneyState {
  // SAFETY OVERRIDE: blocked takes priority over any cached pin.
  // Check quota BEFORE reading cache.
  if (authInfo?.authenticated) {
    const row = sqlite
      .prepare(
        "SELECT count FROM profile_message_usage WHERE profile_key = ?",
      )
      .get(scope.cognitiveOwnerKey) as { count: number } | undefined;
    if (row && row.count >= AUTH_MESSAGE_LIMIT) {
      return "blocked";
    }
  }

  // Read cached pin from anchor session
  const anchorId = scope.knowledgePrimaryKey;
  const cached = sqlite
    .prepare("SELECT journey_state FROM sessions WHERE id = ?")
    .get(anchorId) as { journey_state: string | null } | undefined;

  if (cached?.journey_state) {
    return cached.journey_state as JourneyState;
  }

  // No pin yet — detect and write
  const detected = detectJourneyState(scope, authInfo);
  sqlite
    .prepare("UPDATE sessions SET journey_state = ? WHERE id = ?")
    .run(detected, anchorId);

  return detected;
}

/**
 * Explicitly transition the pinned journey state.
 * Called by tools (generate_page, request_publish) on milestone events.
 */
export function updateJourneyStatePin(
  anchorSessionId: string,
  newState: JourneyState,
): void {
  sqlite
    .prepare("UPDATE sessions SET journey_state = ? WHERE id = ?")
    .run(newState, anchorSessionId);
}

// ---------------------------------------------------------------------------
// Detection: Situations
// ---------------------------------------------------------------------------

export function detectSituations(
  facts: FactRow[],
  ownerKey: string,
  opts?: {
    pendingProposalCount?: number;
    openConflicts?: Array<{ category: string; key: string }>;
    publishableFacts?: FactRow[];
    childCountMap?: Map<string, number>;
  },
): Situation[] {
  const situations: Situation[] = [];

  // Pending proposals (accept pre-fetched count to avoid duplicate DB query)
  const proposalCount = opts?.pendingProposalCount
    ?? createProposalService().getPendingProposals(ownerKey).length;
  if (proposalCount > 0) {
    situations.push("has_pending_proposals");
  }

  // Thin sections
  const publishable = opts?.publishableFacts ?? filterPublishableFacts(facts);
  for (const sectionType of Object.keys(SECTION_FACT_CATEGORIES)) {
    const level = classifySectionRichness(publishable, sectionType);
    if (level === "thin" || level === "empty") {
      // At least one thin section — flag it once
      situations.push("has_thin_sections");
      break;
    }
  }

  // Stale facts (updatedAt older than 30 days)
  const now = new Date();
  const staleFacts = facts.filter((f) => {
    if (!f.updatedAt) return false;
    return daysBetween(new Date(f.updatedAt), now) > STALE_FACT_DAYS;
  });
  if (staleFacts.length > 0) {
    situations.push("has_stale_facts");
  }

  // Open conflicts
  const conflicts = opts?.openConflicts ?? getOpenConflicts(ownerKey);
  if (conflicts.length > 0) {
    situations.push("has_open_conflicts");
  }

  // Has name (legacy facts may use "full-name" instead of "name")
  const hasName = facts.some(
    (f) => f.category === "identity" && (f.key === "name" || f.key === "full-name"),
  );
  if (hasName) {
    situations.push("has_name");
  }

  // Has soul
  const soul = getActiveSoul(ownerKey);
  if (soul) {
    situations.push("has_soul");
  }

  // Archivable facts: relevance-based detection
  const activeFacts = facts.filter(f => !f.archivedAt);
  if (activeFacts.length > ARCHIVABLE_SAFETY_FLOOR) {
    const childCountMap = opts?.childCountMap;
    const archivable = activeFacts.filter(f =>
      computeRelevance(f, childCountMap) < ARCHIVABLE_RELEVANCE_THRESHOLD,
    );

    // Safety floor: don't suggest if it would leave fewer than 5 active facts
    if (archivable.length > 0 && activeFacts.length - archivable.length >= ARCHIVABLE_SAFETY_FLOOR) {
      situations.push("has_archivable_facts");
    }
  }

  // Recent import (connector facts created within last 30 minutes)
  const RECENT_IMPORT_WINDOW_MS = 30 * 60 * 1000;
  const recentCutoff = new Date(Date.now() - RECENT_IMPORT_WINDOW_MS);
  const recentConnectorFacts = facts.filter(
    (f) => f.source === "connector" && f.createdAt && new Date(f.createdAt) > recentCutoff,
  );
  if (recentConnectorFacts.length > 0) {
    situations.push("has_recent_import");
  }

  return situations;
}

// ---------------------------------------------------------------------------
// Detection: Expertise Level
// ---------------------------------------------------------------------------

/**
 * Expertise based on how many distinct sessions this owner has used.
 * 1-2 sessions = novice, 3-5 = familiar, 6+ = expert.
 */
export function detectExpertiseLevel(readKeys: string[]): ExpertiseLevel {
  const sessionCount = getDistinctSessionCount(readKeys);
  if (sessionCount <= 2) return "novice";
  if (sessionCount <= 5) return "familiar";
  return "expert";
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function assembleBootstrapPayload(
  scope: OwnerScope,
  language: string,
  authInfo?: AuthInfo,
  lastUserMessage?: string,
): { payload: BootstrapPayload; data: BootstrapData } {
  const readKeys = scope.knowledgeReadKeys;
  const ownerKey = scope.cognitiveOwnerKey;

  const journeyState = getOrDetectJourneyState(scope, authInfo);

  const facts = getActiveFacts(scope.knowledgePrimaryKey, readKeys);

  // Pre-compute shared data (used by both detectSituations and payload fields)
  const pendingProposalCount = createProposalService().getPendingProposals(ownerKey).length;
  const openConflictRecords = getOpenConflicts(ownerKey);
  const publishable = filterPublishableFacts(facts);

  // Pre-compute child counts for relevance scoring (scoped by readKeys)
  const childCountMap = new Map<string, number>();
  if (readKeys.length > 0) {
    const placeholders = readKeys.map(() => "?").join(",");
    const rows = sqlite
      .prepare(
        `SELECT parent_fact_id, COUNT(*) as cnt FROM facts WHERE parent_fact_id IS NOT NULL AND archived_at IS NULL AND session_id IN (${placeholders}) GROUP BY parent_fact_id`,
      )
      .all(...readKeys) as Array<{ parent_fact_id: string; cnt: number }>;
    for (const row of rows) {
      childCountMap.set(row.parent_fact_id, row.cnt);
    }
  }

  const situations = detectSituations(facts, ownerKey, {
    pendingProposalCount,
    openConflicts: openConflictRecords,
    publishableFacts: publishable,
    childCountMap,
  });
  const expertiseLevel = detectExpertiseLevel(readKeys);

  // User name from facts (legacy facts may use "full-name" instead of "name")
  const nameFact = facts.find(
    (f) => f.category === "identity" && (f.key === "name" || f.key === "full-name"),
  );
  const userName = nameFact
    ? extractNameString(nameFact.value)
    : null;

  // Last seen (most recent message timestamp)
  const lastSeenDaysAgo = getLastSeenDaysAgo(readKeys);

  // Published username
  const publishedUsername = getPublishedUsername(readKeys);

  // Thin sections list
  const thinSections: string[] = [];
  for (const sectionType of Object.keys(SECTION_FACT_CATEGORIES)) {
    const level = classifySectionRichness(publishable, sectionType);
    if (level === "thin" || level === "empty") {
      thinSections.push(sectionType);
    }
  }

  // Stale facts list (category/key)
  const now = new Date();
  const staleFacts: string[] = facts
    .filter((f) => f.updatedAt && daysBetween(new Date(f.updatedAt), now) > STALE_FACT_DAYS)
    .map((f) => `${f.category}/${f.key}`);

  // Open conflicts (category/key descriptions for situation directives)
  const openConflicts: string[] = openConflictRecords.map(
    (c) => `${c.category}/${c.key}`,
  );

  // Archivable facts list (category/key for directive rendering)
  const archivableFacts: string[] = [];
  if (situations.includes("has_archivable_facts")) {
    const activeFacts = facts.filter(f => !f.archivedAt);
    for (const f of activeFacts) {
      if (computeRelevance(f, childCountMap) < ARCHIVABLE_RELEVANCE_THRESHOLD) {
        archivableFacts.push(`${f.category}/${f.key}`);
      }
    }
  }

  // Conversation context (latest summary or null)
  // Lightweight — we don't load the full summary here, just indicate if one exists
  const conversationContext = null; // Reserved for future use

  // Archetype detection — cache on anchor session for cross-session consistency
  const archetypeSessionId = scope.knowledgePrimaryKey;
  const meta = archetypeSessionId ? getSessionMeta(archetypeSessionId) : {};
  let archetype: Archetype;
  if (meta.archetype && typeof meta.archetype === "string") {
    archetype = meta.archetype as Archetype;
  } else {
    // Detect from role fact + last message, then refine from all facts
    const roleFact = facts.find(
      (f) => f.category === "identity" && (f.key === "role" || f.key === "title"),
    );
    const roleStr = roleFact
      ? typeof roleFact.value === "object" && roleFact.value !== null
        ? (roleFact.value as Record<string, unknown>).role as string ?? JSON.stringify(roleFact.value)
        : String(roleFact.value)
      : null;
    const raw = detectArchetypeFromSignals(roleStr, lastUserMessage ?? null);
    archetype = refineArchetype(facts, raw);
    // Cache in session metadata
    if (archetypeSessionId) {
      mergeSessionMeta(archetypeSessionId, { archetype });
    }
  }

  // Read soul for data passthrough (avoids re-query in assembleContext)
  const soul = getActiveSoul(ownerKey);

  // Circuito A: Archetype → Soul auto-proposal
  // When archetype is non-generalist, no soul exists, and no pending proposals,
  // propose an initial soul profile based on archetype strategies.
  // Guard against duplicates: assembleBootstrapPayload runs every message (R7-S6).
  if (archetype !== "generalist" && !soul) {
    const pendingSoulProposals = getPendingProposals(ownerKey);
    if (pendingSoulProposals.length === 0) {
      const strategy = ARCHETYPE_STRATEGIES[archetype];
      try {
        proposeSoulChange(ownerKey, {
          tone: strategy.toneHint,
          communicationStyle: strategy.communicationStyle,
        }, `Auto-suggested from detected archetype: ${archetype}`);
      } catch { /* best-effort: don't block bootstrap */ }
    }
  }

  return {
    payload: {
      journeyState,
      situations,
      expertiseLevel,
      userName,
      lastSeenDaysAgo,
      publishedUsername,
      pendingProposalCount,
      thinSections,
      staleFacts,
      openConflicts,
      archivableFacts,
      language,
      conversationContext,
      archetype,
    },
    data: {
      facts,
      soul,
      openConflictRecords,
      publishableFacts: publishable,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers (DB queries)
// ---------------------------------------------------------------------------

/**
 * Count distinct session IDs that have messages in the given read keys.
 */
export function getDistinctSessionCount(readKeys: string[]): number {
  if (readKeys.length === 0) return 0;
  const placeholders = readKeys.map(() => "?").join(",");
  const row = sqlite
    .prepare(
      `SELECT COUNT(DISTINCT session_id) AS cnt FROM messages WHERE session_id IN (${placeholders})`,
    )
    .get(...readKeys) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}



/**
 * Days since the most recent message across all read keys. Returns null if no messages.
 */
function getLastSeenDaysAgo(readKeys: string[]): number | null {
  if (readKeys.length === 0) return null;
  const placeholders = readKeys.map(() => "?").join(",");
  const row = sqlite
    .prepare(
      `SELECT MAX(created_at) AS latest FROM messages WHERE session_id IN (${placeholders})`,
    )
    .get(...readKeys) as { latest: string | null } | undefined;
  if (!row?.latest) return null;
  return daysBetween(new Date(row.latest), new Date());
}

/**
 * Get the updatedAt timestamp of the most recent published page for these session IDs.
 */
function getPublishedUpdatedAt(sessionIds: string[]): string | null {
  if (sessionIds.length === 0) return null;
  const placeholders = sessionIds.map(() => "?").join(",");
  const row = sqlite
    .prepare(
      `SELECT updated_at FROM page WHERE session_id IN (${placeholders}) AND status = 'published' ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(...sessionIds) as { updated_at: string | null } | undefined;
  return row?.updated_at ?? null;
}

/**
 * Calculate whole days between two dates (rounded to nearest day).
 * Math.round avoids the up-to-23h59m underestimate of Math.floor.
 * @internal Exported for testing — not part of the public API.
 */
export function daysBetween(earlier: Date, later: Date): number {
  const diffMs = later.getTime() - earlier.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Extract a display name string from a fact value.
 * Handles both {full: "..."} and plain string values.
 */
function extractNameString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const v = value as Record<string, unknown>;
    if (typeof v.full === "string") return v.full;
    if (typeof v.name === "string") return v.name;
  }
  return null;
}
