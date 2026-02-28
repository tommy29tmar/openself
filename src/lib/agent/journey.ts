// src/lib/agent/journey.ts

/**
 * Journey Intelligence — deterministic, zero-LLM detection layer.
 *
 * Detects where the user is in their journey (state), what's happening (situations),
 * and how experienced they are (expertise level). All detection is synchronous
 * and runs before the LLM sees anything.
 */

import { sqlite } from "@/lib/db";
import { countFacts, getAllFacts, type FactRow } from "@/lib/services/kb-service";
import { hasAnyPublishedPage, getDraft, getPublishedUsername } from "@/lib/services/page-service";
import { getActiveSoul } from "@/lib/services/soul-service";
import { getOpenConflicts } from "@/lib/services/conflict-service";
import { createProposalService } from "@/lib/services/proposal-service";
import { classifySectionRichness } from "@/lib/services/section-richness";
import { filterPublishableFacts } from "@/lib/services/page-projection";
import { SECTION_FACT_CATEGORIES } from "@/lib/services/personalization-hashing";
import type { OwnerScope } from "@/lib/auth/session";
import type { AuthInfo } from "@/lib/agent/context";
import { AUTH_MESSAGE_LIMIT } from "@/lib/constants";

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
  | "has_soul";

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
  language: string;
  conversationContext: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Facts older than this are considered stale. */
const STALE_FACT_DAYS = 30;

/** Published page updated more recently than this is "fresh". */
const FRESH_PAGE_DAYS = 7;

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
): BootstrapPayload {
  const readKeys = scope.knowledgeReadKeys;
  const ownerKey = scope.cognitiveOwnerKey;

  const journeyState = getOrDetectJourneyState(scope, authInfo);

  const facts = getAllFacts(scope.knowledgePrimaryKey, readKeys);

  // Pre-compute shared data (used by both detectSituations and payload fields)
  const pendingProposalCount = createProposalService().getPendingProposals(ownerKey).length;
  const openConflictRecords = getOpenConflicts(ownerKey);
  const publishable = filterPublishableFacts(facts);

  const situations = detectSituations(facts, ownerKey, {
    pendingProposalCount,
    openConflicts: openConflictRecords,
    publishableFacts: publishable,
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

  // Conversation context (latest summary or null)
  // Lightweight — we don't load the full summary here, just indicate if one exists
  const conversationContext = null; // Reserved for future use

  return {
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
    language,
    conversationContext,
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
 * Calculate whole days between two dates.
 */
export function daysBetween(earlier: Date, later: Date): number {
  const diffMs = later.getTime() - earlier.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
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
