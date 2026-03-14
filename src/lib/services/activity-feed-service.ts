import { eq, and, gte, desc, sql, or, inArray } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import {
  syncLog,
  connectors,
  sectionCopyProposals,
  soulChangeProposals,
  episodicPatternProposals,
  profiles,
} from "@/lib/db/schema";
import type {
  FeedItem,
  SyncErrorDetail,
  ConformityDetail,
  SoulDetail,
  EpisodicDetail,
} from "./activity-feed-types";

export const FEED_WINDOW_DAYS = 7;

function windowFloor(days = FEED_WINDOW_DAYS): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Per-source mappers
// ---------------------------------------------------------------------------

/**
 * Sync/error feed items from the sync_log + connectors JOIN.
 */
export function getSyncFeedItems(
  ownerKey: string,
  since: string,
  db: typeof defaultDb = defaultDb,
): FeedItem[] {
  // Drizzle doesn't have a clean join helper used elsewhere in the codebase,
  // so we use the select().from().innerJoin() form.
  // Only show error/failed syncs — successful syncs are noise.
  const rows = db
    .select({
      id: syncLog.id,
      status: syncLog.status,
      error: syncLog.error,
      createdAt: syncLog.createdAt,
      connectorType: connectors.connectorType,
      connectorId: connectors.id,
    })
    .from(syncLog)
    .innerJoin(connectors, eq(syncLog.connectorId, connectors.id))
    .where(
      and(
        eq(connectors.ownerKey, ownerKey),
        gte(syncLog.createdAt, since),
        or(eq(syncLog.status, "error"), eq(syncLog.status, "failed")),
      ),
    )
    .orderBy(desc(syncLog.createdAt))
    .limit(20)
    .all();

  return rows.map((row) => {
    const detail: SyncErrorDetail = {
      type: "connector_error",
      connectorType: row.connectorType,
      error: row.error ?? "Unknown error",
      lastSuccessfulSync: null,
    };
    return {
      id: `sync_${row.id}`,
      type: "connector_error" as const,
      category: "informational" as const,
      connectorType: row.connectorType,
      title: "",
      createdAt: row.createdAt ?? new Date().toISOString(),
      status: row.status,
      detail,
    } satisfies FeedItem;
  });
}

/**
 * Conformity proposal feed items.
 * Returns: pending proposals + accepted/rejected proposals reviewed within the last 24h.
 */
export function getConformityFeedItems(
  ownerKey: string,
  db: typeof defaultDb = defaultDb,
): FeedItem[] {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const rows = db
    .select()
    .from(sectionCopyProposals)
    .where(
      and(
        eq(sectionCopyProposals.ownerKey, ownerKey),
        or(
          eq(sectionCopyProposals.status, "pending"),
          and(
            inArray(sectionCopyProposals.status, ["accepted", "rejected"]),
            gte(sectionCopyProposals.reviewedAt, cutoff24h),
          ),
        ),
      ),
    )
    .orderBy(desc(sectionCopyProposals.createdAt))
    .all();

  return rows.map((row) => {
    const detail: ConformityDetail = {
      type: "conformity_proposal",
      proposalId: row.id,
      sectionType: row.sectionType,
      severity: row.severity,
      reason: row.reason,
      currentContent: row.currentContent,
      proposedContent: row.proposedContent,
    };
    return {
      id: `conformity_${row.id}`,
      type: "conformity_proposal" as const,
      category: "actionable" as const,
      title: "",
      createdAt: row.createdAt ?? new Date().toISOString(),
      status: row.status,
      detail,
    } satisfies FeedItem;
  });
}

/**
 * Soul proposal feed items.
 * Returns: pending proposals + accepted/rejected proposals resolved within the last 24h.
 */
export function getSoulFeedItems(
  ownerKey: string,
  db: typeof defaultDb = defaultDb,
): FeedItem[] {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const rows = db
    .select()
    .from(soulChangeProposals)
    .where(
      and(
        eq(soulChangeProposals.ownerKey, ownerKey),
        or(
          eq(soulChangeProposals.status, "pending"),
          and(
            inArray(soulChangeProposals.status, ["accepted", "rejected"]),
            gte(soulChangeProposals.resolvedAt, cutoff24h),
          ),
        ),
      ),
    )
    .orderBy(desc(soulChangeProposals.createdAt))
    .all();

  return rows.map((row) => {
    // proposedOverlay may be a JSON string (SQLite mode: "json" auto-parses, but handle both)
    let overlay: Record<string, unknown>;
    if (typeof row.proposedOverlay === "string") {
      try {
        overlay = JSON.parse(row.proposedOverlay) as Record<string, unknown>;
      } catch {
        overlay = {};
      }
    } else {
      overlay = (row.proposedOverlay as Record<string, unknown>) ?? {};
    }

    const detail: SoulDetail = {
      type: "soul_proposal",
      proposalId: row.id,
      proposedOverlay: overlay,
      reason: row.reason ?? null,
    };
    return {
      id: `soul_${row.id}`,
      type: "soul_proposal" as const,
      category: "actionable" as const,
      title: "",
      createdAt: row.createdAt ?? new Date().toISOString(),
      status: row.status,
      detail,
    } satisfies FeedItem;
  });
}

/**
 * Episodic pattern proposal feed items.
 * Returns: pending proposals that have not yet expired.
 */
export function getEpisodicFeedItems(
  ownerKey: string,
  db: typeof defaultDb = defaultDb,
): FeedItem[] {
  const now = new Date().toISOString();

  const rows = db
    .select()
    .from(episodicPatternProposals)
    .where(
      and(
        eq(episodicPatternProposals.ownerKey, ownerKey),
        eq(episodicPatternProposals.status, "pending"),
        gte(episodicPatternProposals.expiresAt, now),
      ),
    )
    .orderBy(desc(episodicPatternProposals.createdAt))
    .all();

  return rows.map((row) => {
    const detail: EpisodicDetail = {
      type: "episodic_pattern",
      proposalId: row.id,
      actionType: row.actionType,
      patternSummary: row.patternSummary,
      eventCount: row.eventCount,
    };
    return {
      id: `episodic_${row.id}`,
      type: "episodic_pattern" as const,
      category: "actionable" as const,
      title: "",
      createdAt: row.createdAt ?? new Date().toISOString(),
      status: row.status,
      detail,
    } satisfies FeedItem;
  });
}

// ---------------------------------------------------------------------------
// Main feed aggregator
// ---------------------------------------------------------------------------

export interface GetActivityFeedOpts {
  /** How many items to return. Default: 30. */
  limit?: number;
  /** ISO timestamp lower-bound. Defaults to FEED_WINDOW_DAYS ago. */
  since?: string;
}

/**
 * Merge all feed sources, sort by createdAt DESC, slice to limit.
 */
export function getActivityFeed(
  ownerKey: string,
  opts?: GetActivityFeedOpts,
  db: typeof defaultDb = defaultDb,
): FeedItem[] {
  const limit = opts?.limit ?? 30;
  const since = opts?.since ?? windowFloor(FEED_WINDOW_DAYS);

  const items: FeedItem[] = [
    ...getSyncFeedItems(ownerKey, since, db),
    ...getConformityFeedItems(ownerKey, db),
    ...getSoulFeedItems(ownerKey, db),
    ...getEpisodicFeedItems(ownerKey, db),
  ];

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Unread count
// ---------------------------------------------------------------------------

/**
 * Lightweight COUNT query — does not fetch full items.
 */
export function getUnreadCount(
  ownerKey: string,
  db: typeof defaultDb = defaultDb,
): number {
  const windowFloorTs = windowFloor(FEED_WINDOW_DAYS);
  const now = new Date().toISOString();

  // Determine since: max(lastFeedViewedAt, windowFloor)
  const profileRow = db
    .select({ lastFeedViewedAt: profiles.lastFeedViewedAt })
    .from(profiles)
    .where(eq(profiles.id, ownerKey))
    .get();

  const lastViewed = profileRow?.lastFeedViewedAt ?? null;
  const since =
    lastViewed && lastViewed > windowFloorTs ? lastViewed : windowFloorTs;

  // 1) Sync log count — only error/failed syncs (successful syncs are noise)
  const syncCountRow = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(syncLog)
    .innerJoin(connectors, eq(syncLog.connectorId, connectors.id))
    .where(
      and(
        eq(connectors.ownerKey, ownerKey),
        gte(syncLog.createdAt, since),
        or(eq(syncLog.status, "error"), eq(syncLog.status, "failed")),
      ),
    )
    .get();
  const syncCount = syncCountRow?.count ?? 0;

  // 2) Conformity proposals (pending only — always unread)
  const conformityCountRow = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(sectionCopyProposals)
    .where(
      and(
        eq(sectionCopyProposals.ownerKey, ownerKey),
        eq(sectionCopyProposals.status, "pending"),
      ),
    )
    .get();
  const conformityCount = conformityCountRow?.count ?? 0;

  // 3) Soul proposals (pending only — always unread)
  const soulCountRow = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(soulChangeProposals)
    .where(
      and(
        eq(soulChangeProposals.ownerKey, ownerKey),
        eq(soulChangeProposals.status, "pending"),
      ),
    )
    .get();
  const soulCount = soulCountRow?.count ?? 0;

  // 4) Episodic proposals (pending + not expired — always unread)
  const episodicCountRow = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(episodicPatternProposals)
    .where(
      and(
        eq(episodicPatternProposals.ownerKey, ownerKey),
        eq(episodicPatternProposals.status, "pending"),
        gte(episodicPatternProposals.expiresAt, now),
      ),
    )
    .get();
  const episodicCount = episodicCountRow?.count ?? 0;

  return syncCount + conformityCount + soulCount + episodicCount;
}

// ---------------------------------------------------------------------------
// Mark feed viewed
// ---------------------------------------------------------------------------

/**
 * Record that the owner has viewed the feed now.
 * UPDATE profiles SET last_feed_viewed_at = now WHERE id = ownerKey.
 * Falls back to INSERT with onConflictDoUpdate for single-user mode.
 */
export function markFeedViewed(
  ownerKey: string,
  db: typeof defaultDb = defaultDb,
): void {
  const now = new Date().toISOString();

  const result = db
    .update(profiles)
    .set({ lastFeedViewedAt: now })
    .where(eq(profiles.id, ownerKey))
    .run();

  if ((result as { changes?: number }).changes === 0) {
    // Profile row doesn't exist (single-user / anonymous mode) — upsert
    db.insert(profiles)
      .values({ id: ownerKey, lastFeedViewedAt: now })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { lastFeedViewedAt: now },
      })
      .run();
  }
}
