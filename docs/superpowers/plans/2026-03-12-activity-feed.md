# Activity Feed (Unified Notification System) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface all background events (connector syncs, proposals, budget warnings) in a notification bell + activity drawer, with agent context awareness.

**Architecture:** Derived feed from existing tables (sync_log, soul_change_proposals, episodic_pattern_proposals, section_copy_proposals) — no new notification table. ActivityDrawer opens full-screen on mobile, 480px fixed on desktop. Agent gets a compressed summary in the existing pageStateBlock (no new context block). Read/unread tracked via `last_feed_viewed_at` timestamp on profiles.

**Tech Stack:** TypeScript, Next.js App Router, Drizzle ORM (SQLite), React (inline styles, no CSS framework), Vitest.

---

## File Structure

### Create
| File | Responsibility |
|------|---------------|
| `db/migrations/0032_feed_viewed_at.sql` | Add `last_feed_viewed_at` column to profiles |
| `src/lib/services/activity-feed-service.ts` | Core feed logic: query, merge, count, mark-viewed |
| `src/lib/services/activity-feed-types.ts` | FeedItem type, FeedItemType union, mappers per source |
| `src/lib/services/activity-feed-formatters.ts` | Format feed items for agent context (text summary) |
| `src/app/api/activity-feed/route.ts` | GET list |
| `src/app/api/activity-feed/mark-viewed/route.ts` | POST mark-viewed |
| `src/app/api/activity-feed/unread-count/route.ts` | GET unread count (lightweight) |
| `src/hooks/useUnreadCount.ts` | Client hook: fetch count, revalidate on focus |
| `src/components/notifications/NotificationBell.tsx` | Bell icon + red badge |
| `src/components/notifications/ActivityDrawer.tsx` | Drawer shell: mobile full-screen, desktop 480px |
| `src/components/notifications/FeedItem.tsx` | Single feed item: icon, title, time, expand/collapse |
| `src/components/notifications/FeedItemDetail.tsx` | Per-type detail view (sync items, proposal diffs) |
| `src/components/notifications/FeedItemActions.tsx` | Accept/Reject buttons for actionable proposals |
| `tests/evals/activity-feed-service.test.ts` | Feed service unit tests |
| `tests/evals/activity-feed-api.test.ts` | API route tests |
| `tests/evals/activity-feed-context.test.ts` | Agent context integration tests |

### Modify
| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add `lastFeedViewedAt` column to `profiles` table |
| `src/lib/agent/context.ts` | Extend pageStateBlock with RECENT ACTIVITY + PENDING ACTIONS |
| `src/lib/i18n/ui-strings.ts` | Add ~15 L10N keys for activity feed (8 languages) |
| `src/components/layout/SplitView.tsx` | Add activityDrawer state, pass to NavBar, render drawer |
| `src/components/layout/BuilderNavBar.tsx` | Add NotificationBell between spacer and Presence button |

---

## Chunk 1: Data Layer

### Task 1: Migration + Schema Update

**Files:**
- Create: `db/migrations/0032_feed_viewed_at.sql`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Create migration file**

```sql
-- 0032_feed_viewed_at.sql
ALTER TABLE profiles ADD COLUMN last_feed_viewed_at TEXT;
```

- [ ] **Step 2: Update Drizzle schema**

In `src/lib/db/schema.ts`, add to the `profiles` table definition:

```typescript
lastFeedViewedAt: text("last_feed_viewed_at"),
```

- [ ] **Step 3: Bump EXPECTED_SCHEMA_VERSION**

Find the `EXPECTED_SCHEMA_VERSION` constant (likely in `src/lib/db/` or `src/lib/agent/context.ts`) and change from `31` to `32`.

- [ ] **Step 4: Verify migration applies**

Run: `npm run dev` (starts app, leader runs migrations)
Expected: No migration errors, profiles table has new column.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0032_feed_viewed_at.sql src/lib/db/schema.ts
git commit -m "feat: migration 0032 — add last_feed_viewed_at to profiles"
```

---

### Task 2: Feed Types + Per-Source Mappers

**Files:**
- Create: `src/lib/services/activity-feed-types.ts`

- [ ] **Step 1: Write type definitions**

```typescript
// activity-feed-types.ts

export type FeedItemType =
  | "connector_sync"
  | "connector_error"
  | "conformity_proposal"
  | "soul_proposal"
  | "episodic_pattern";

export type FeedCategory = "informational" | "actionable";

export interface FeedItem {
  id: string;
  type: FeedItemType;
  category: FeedCategory;
  connectorType?: string; // github, rss, spotify, strava, linkedin_zip
  title: string; // pre-formatted for display
  createdAt: string; // ISO 8601
  status?: string; // for actionable: pending | accepted | rejected | stale | expired
  detail: FeedItemDetail;
}

export type FeedItemDetail =
  | SyncDetail
  | SyncErrorDetail
  | ConformityDetail
  | SoulDetail
  | EpisodicDetail;

export interface SyncDetail {
  type: "connector_sync";
  connectorType: string;
  factsCreated: number;
  factsUpdated: number;
  eventsCreated: number;
}

export interface SyncErrorDetail {
  type: "connector_error";
  connectorType: string;
  error: string;
  lastSuccessfulSync: string | null;
}

export interface ConformityDetail {
  type: "conformity_proposal";
  proposalId: number;
  sectionType: string;
  severity: string;
  reason: string;
  currentContent: string;
  proposedContent: string;
}

export interface SoulDetail {
  type: "soul_proposal";
  proposalId: string;
  proposedOverlay: Record<string, unknown>;
  reason: string | null;
}

export interface EpisodicDetail {
  type: "episodic_pattern";
  proposalId: string;
  actionType: string;
  patternSummary: string;
  eventCount: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/services/activity-feed-types.ts
git commit -m "feat: activity feed type definitions"
```

---

### Task 3: Feed Service Core

**Files:**
- Create: `src/lib/services/activity-feed-service.ts`

- [ ] **Step 1: Write tests first**

Create `tests/evals/activity-feed-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
// Tests for activity-feed-service
// Structure: test each mapper independently, then test getActivityFeed merge+sort

describe("activity-feed-service", () => {
  describe("getSyncFeedItems", () => {
    it("returns connector_sync items for successful syncs", async () => {
      // Setup: insert a connector + sync_log entry with status='success'
      // Act: call getSyncFeedItems(ownerKey, since)
      // Assert: returns FeedItem with type='connector_sync', correct counts
    });

    it("returns connector_error items for failed syncs", async () => {
      // Setup: insert connector + sync_log with status='error'
      // Assert: type='connector_error', error message present
    });

    it("excludes syncs older than since parameter", async () => {
      // Setup: insert old sync_log entry
      // Assert: empty result
    });
  });

  describe("getProposalFeedItems", () => {
    it("returns pending conformity proposals", async () => {
      // Setup: insert section_copy_proposals with status='pending'
      // Assert: type='conformity_proposal', category='actionable'
    });

    it("returns pending soul proposals", async () => {
      // Setup: insert soul_change_proposals with status='pending'
      // Assert: type='soul_proposal', detail includes proposedOverlay
    });

    it("returns pending episodic pattern proposals", async () => {
      // Setup: insert episodic_pattern_proposals with status='pending'
      // Assert: type='episodic_pattern', detail includes patternSummary
    });

    it("excludes resolved proposals", async () => {
      // Setup: insert proposals with status='accepted'
      // Assert: not in results
    });
  });

  describe("getActivityFeed", () => {
    it("merges all sources sorted by createdAt DESC", async () => {
      // Setup: insert mix of sync logs + proposals with different timestamps
      // Assert: result sorted newest first
    });

    it("respects limit parameter", async () => {
      // Setup: insert 10 items
      // Act: getActivityFeed(ownerKey, { limit: 3 })
      // Assert: exactly 3 items returned
    });
  });

  describe("getUnreadCount", () => {
    it("counts items created after last_feed_viewed_at", async () => {
      // Setup: set last_feed_viewed_at to 1h ago, create items 30min ago
      // Assert: count = number of recent items
    });

    it("returns total count when last_feed_viewed_at is null", async () => {
      // Setup: no last_feed_viewed_at set, create items
      // Assert: count = total items
    });
  });

  describe("markFeedViewed", () => {
    it("updates last_feed_viewed_at on profiles", async () => {
      // Act: markFeedViewed(ownerKey)
      // Assert: profiles row has last_feed_viewed_at ≈ now
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/activity-feed-service.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement feed service**

```typescript
// src/lib/services/activity-feed-service.ts
import { db } from "@/lib/db";
import { syncLog, connectors, sectionCopyProposals, soulChangeProposals, episodicPatternProposals, profiles } from "@/lib/db/schema";
import { eq, and, gte, desc, inArray, sql } from "drizzle-orm";
import type { FeedItem, FeedItemType } from "./activity-feed-types";

const FEED_WINDOW_DAYS = 7;

/** Sync log → FeedItem[] (success + error) */
function getSyncFeedItems(ownerKey: string, since: string): FeedItem[] {
  const rows = db
    .select({
      id: syncLog.id,
      status: syncLog.status,
      factsCreated: syncLog.factsCreated,
      factsUpdated: syncLog.factsUpdated,
      eventsCreated: syncLog.eventsCreated,
      error: syncLog.error,
      createdAt: syncLog.createdAt,
      connectorType: connectors.connectorType,
      lastSync: connectors.lastSync,
    })
    .from(syncLog)
    .innerJoin(connectors, eq(syncLog.connectorId, connectors.id))
    .where(
      and(
        eq(connectors.ownerKey, ownerKey),
        gte(syncLog.createdAt, since)
      )
    )
    .orderBy(desc(syncLog.createdAt))
    .limit(20)
    .all();

  return rows.map((r) => {
    const isError = r.status === "error";
    return {
      id: `sync_${r.id}`,
      type: isError ? "connector_error" as const : "connector_sync" as const,
      category: "informational" as const,
      connectorType: r.connectorType,
      title: "", // Populated by UI via L10N
      createdAt: r.createdAt,
      detail: isError
        ? { type: "connector_error" as const, connectorType: r.connectorType, error: r.error ?? "Unknown error", lastSuccessfulSync: r.lastSync }
        : { type: "connector_sync" as const, connectorType: r.connectorType, factsCreated: r.factsCreated ?? 0, factsUpdated: r.factsUpdated ?? 0, eventsCreated: r.eventsCreated ?? 0 },
    };
  });
}

/** Conformity proposals → FeedItem[] (pending + recently resolved in last 24h) */
function getConformityFeedItems(ownerKey: string): FeedItem[] {
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .select()
    .from(sectionCopyProposals)
    .where(
      and(
        eq(sectionCopyProposals.ownerKey, ownerKey),
        sql`(${sectionCopyProposals.status} = 'pending' OR (${sectionCopyProposals.status} IN ('accepted', 'rejected') AND ${sectionCopyProposals.reviewedAt} >= ${recentCutoff}))`
      )
    )
    .orderBy(desc(sectionCopyProposals.createdAt))
    .limit(10)
    .all();

  return rows.map((r) => ({
    id: `conformity_${r.id}`,
    type: "conformity_proposal" as const,
    category: "actionable" as const,
    title: "",
    createdAt: r.createdAt,
    status: r.status,
    detail: {
      type: "conformity_proposal" as const,
      proposalId: r.id,
      sectionType: r.sectionType,
      severity: r.severity,
      reason: r.reason,
      currentContent: r.currentContent,
      proposedContent: r.proposedContent,
    },
  }));
}

/** Soul proposals → FeedItem[] (pending + recently resolved in last 24h) */
function getSoulFeedItems(ownerKey: string): FeedItem[] {
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .select()
    .from(soulChangeProposals)
    .where(
      and(
        eq(soulChangeProposals.ownerKey, ownerKey),
        sql`(${soulChangeProposals.status} = 'pending' OR (${soulChangeProposals.status} IN ('accepted', 'rejected') AND ${soulChangeProposals.resolvedAt} >= ${recentCutoff}))`
      )
    )
    .orderBy(desc(soulChangeProposals.createdAt))
    .limit(10)
    .all();

  return rows.map((r) => ({
    id: `soul_${r.id}`,
    type: "soul_proposal" as const,
    category: "actionable" as const,
    title: "",
    createdAt: r.createdAt,
    status: r.status,
    detail: {
      type: "soul_proposal" as const,
      proposalId: r.id,
      proposedOverlay: typeof r.proposedOverlay === "string" ? JSON.parse(r.proposedOverlay) : r.proposedOverlay,
      reason: r.reason,
    },
  }));
}

/** Episodic pattern proposals → FeedItem[] (filters out expired via expiresAt) */
function getEpisodicFeedItems(ownerKey: string): FeedItem[] {
  const now = new Date().toISOString();
  const rows = db
    .select()
    .from(episodicPatternProposals)
    .where(
      and(
        eq(episodicPatternProposals.ownerKey, ownerKey),
        eq(episodicPatternProposals.status, "pending"),
        gte(episodicPatternProposals.expiresAt, now) // exclude expired proposals
      )
    )
    .orderBy(desc(episodicPatternProposals.createdAt))
    .limit(10)
    .all();

  return rows.map((r) => ({
    id: `episodic_${r.id}`,
    type: "episodic_pattern" as const,
    category: "actionable" as const,
    title: "",
    createdAt: r.createdAt,
    status: r.status,
    detail: {
      type: "episodic_pattern" as const,
      proposalId: r.id,
      actionType: r.actionType,
      patternSummary: r.patternSummary,
      eventCount: r.eventCount,
    },
  }));
}

/** Main: merge all sources, sort by createdAt DESC */
export function getActivityFeed(
  ownerKey: string,
  opts?: { limit?: number; since?: string }
): FeedItem[] {
  const limit = opts?.limit ?? 30;
  const since =
    opts?.since ??
    new Date(Date.now() - FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const syncItems = getSyncFeedItems(ownerKey, since);
  const conformityItems = getConformityFeedItems(ownerKey);
  const soulItems = getSoulFeedItems(ownerKey);
  const episodicItems = getEpisodicFeedItems(ownerKey);

  return [...syncItems, ...conformityItems, ...soulItems, ...episodicItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/** Unread count: lightweight COUNT queries (no full feed fetch) */
export function getUnreadCount(ownerKey: string): number {
  const profile = db
    .select({ lastFeedViewedAt: profiles.lastFeedViewedAt })
    .from(profiles)
    .where(eq(profiles.id, ownerKey))
    .get();

  // Apply same FEED_WINDOW_DAYS floor as getActivityFeed to avoid
  // badge showing "99+" while feed only shows 7 days of items
  const windowFloor = new Date(Date.now() - FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const since = profile?.lastFeedViewedAt
    ? (profile.lastFeedViewedAt > windowFloor ? profile.lastFeedViewedAt : windowFloor)
    : windowFloor;
  const now = new Date().toISOString();

  // 4 lightweight COUNT queries instead of building full FeedItem objects
  const syncCount = db
    .select({ c: sql<number>`count(*)` })
    .from(syncLog)
    .innerJoin(connectors, eq(syncLog.connectorId, connectors.id))
    .where(and(eq(connectors.ownerKey, ownerKey), gte(syncLog.createdAt, since)))
    .get()?.c ?? 0;

  // Proposals: count ALL pending (no time filter) — pending is always "unread"
  // until acted upon. This matches getActivityFeed which shows all pending.
  const conformityCount = db
    .select({ c: sql<number>`count(*)` })
    .from(sectionCopyProposals)
    .where(and(eq(sectionCopyProposals.ownerKey, ownerKey), eq(sectionCopyProposals.status, "pending")))
    .get()?.c ?? 0;

  const soulCount = db
    .select({ c: sql<number>`count(*)` })
    .from(soulChangeProposals)
    .where(and(eq(soulChangeProposals.ownerKey, ownerKey), eq(soulChangeProposals.status, "pending")))
    .get()?.c ?? 0;

  const episodicCount = db
    .select({ c: sql<number>`count(*)` })
    .from(episodicPatternProposals)
    .where(and(
      eq(episodicPatternProposals.ownerKey, ownerKey),
      eq(episodicPatternProposals.status, "pending"),
      gte(episodicPatternProposals.expiresAt, now) // only non-expired
    ))
    .get()?.c ?? 0;

  return syncCount + conformityCount + soulCount + episodicCount;
}

/** Mark feed as viewed: set last_feed_viewed_at = now.
 *  Handles single-user mode where profiles row may not exist for "__default__".
 */
export function markFeedViewed(ownerKey: string): void {
  const now = new Date().toISOString();
  const result = db.update(profiles)
    .set({ lastFeedViewedAt: now })
    .where(eq(profiles.id, ownerKey))
    .run();

  // Fallback for single-user mode: if no profiles row was updated,
  // insert a minimal row so subsequent reads find lastFeedViewedAt.
  if (result.changes === 0) {
    db.insert(profiles)
      .values({ id: ownerKey, lastFeedViewedAt: now })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { lastFeedViewedAt: now },
      })
      .run();
  }
}

// Re-export for testing
export { getSyncFeedItems, getConformityFeedItems, getSoulFeedItems, getEpisodicFeedItems };
```

> **Note to implementer:** Verify the exact Drizzle column name for owner filtering on the `connectors` table. It may be `connectors.profileId` or `connectors.ownerKey`. Check `src/lib/db/schema.ts` for the connectors table definition. Also verify that `syncLog.connectorId` matches the FK column name.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/activity-feed-service.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/activity-feed-service.ts tests/evals/activity-feed-service.test.ts
git commit -m "feat: activity feed service — derived feed from existing tables"
```

---

### Task 4: Agent Context Formatters

**Files:**
- Create: `src/lib/services/activity-feed-formatters.ts`

- [ ] **Step 1: Write tests**

Create `tests/evals/activity-feed-context.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatFeedForContext } from "@/lib/services/activity-feed-formatters";
import type { FeedItem } from "@/lib/services/activity-feed-types";

describe("formatFeedForContext", () => {
  it("formats sync items with relative time and counts", () => {
    const items: FeedItem[] = [{
      id: "sync_1",
      type: "connector_sync",
      category: "informational",
      connectorType: "strava",
      title: "",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
      detail: { type: "connector_sync", connectorType: "strava", factsCreated: 3, factsUpdated: 0, eventsCreated: 2 },
    }];
    const result = formatFeedForContext(items);
    expect(result).toContain("Strava");
    expect(result).toContain("3 facts");
    expect(result).toContain("2 events");
  });

  it("formats pending proposals as PENDING ACTIONS", () => {
    const items: FeedItem[] = [{
      id: "soul_1",
      type: "soul_proposal",
      category: "actionable",
      title: "",
      createdAt: new Date().toISOString(),
      status: "pending",
      detail: { type: "soul_proposal", proposalId: "abc", proposedOverlay: { voice: "signal" }, reason: "tone shift" },
    }];
    const result = formatFeedForContext(items);
    expect(result).toContain("PENDING");
    expect(result).toContain("soul");
  });

  it("returns empty string when no items", () => {
    expect(formatFeedForContext([])).toBe("");
  });

  it("stays within ~200 tokens", () => {
    // Create 20 items of mixed types
    const items: FeedItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `sync_${i}`,
      type: "connector_sync" as const,
      category: "informational" as const,
      connectorType: "rss",
      title: "",
      createdAt: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
      detail: { type: "connector_sync" as const, connectorType: "rss", factsCreated: 1, factsUpdated: 0, eventsCreated: 0 },
    }));
    const result = formatFeedForContext(items);
    // ~4 chars per token, 200 tokens ≈ 800 chars
    expect(result.length).toBeLessThan(1000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/activity-feed-context.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement formatters**

```typescript
// src/lib/services/activity-feed-formatters.ts
import type { FeedItem } from "./activity-feed-types";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function connectorLabel(type: string): string {
  const labels: Record<string, string> = {
    github: "GitHub",
    linkedin_zip: "LinkedIn",
    rss: "RSS",
    spotify: "Spotify",
    strava: "Strava",
  };
  return labels[type] ?? capitalizeFirst(type);
}

/**
 * Format feed items for agent context injection.
 * Output is compact text, max ~200 tokens.
 * Split into RECENT ACTIVITY (informational) + PENDING ACTIONS (actionable).
 */
export function formatFeedForContext(items: FeedItem[]): string {
  if (items.length === 0) return "";

  const syncs = items.filter((i) => i.type === "connector_sync" || i.type === "connector_error");
  const pending = items.filter((i) => i.category === "actionable" && i.status === "pending");

  const lines: string[] = [];

  // RECENT ACTIVITY — max 5 sync items
  if (syncs.length > 0) {
    lines.push("RECENT ACTIVITY:");
    for (const s of syncs.slice(0, 5)) {
      const d = s.detail;
      if (d.type === "connector_sync") {
        lines.push(`- ${connectorLabel(d.connectorType)} synced ${relativeTime(s.createdAt)}: ${d.factsCreated} facts, ${d.eventsCreated} events`);
      } else if (d.type === "connector_error") {
        lines.push(`- ${connectorLabel(d.connectorType)} sync failed ${relativeTime(s.createdAt)}: ${d.error}`);
      }
    }
  }

  // PENDING ACTIONS — count by type
  if (pending.length > 0) {
    const counts: Record<string, number> = {};
    for (const p of pending) {
      counts[p.type] = (counts[p.type] ?? 0) + 1;
    }
    const parts: string[] = [];
    if (counts.conformity_proposal) parts.push(`${counts.conformity_proposal} page improvement${counts.conformity_proposal > 1 ? "s" : ""}`);
    if (counts.soul_proposal) parts.push(`${counts.soul_proposal} soul proposal${counts.soul_proposal > 1 ? "s" : ""}`);
    if (counts.episodic_pattern) parts.push(`${counts.episodic_pattern} pattern${counts.episodic_pattern > 1 ? "s" : ""}`);
    lines.push(`PENDING ACTIONS: ${parts.join(", ")}`);
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/evals/activity-feed-context.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/activity-feed-formatters.ts tests/evals/activity-feed-context.test.ts
git commit -m "feat: activity feed context formatters for agent injection"
```

---

## Chunk 2: API Routes + Agent Context

### Task 5: API Routes

**Files:**
- Create: `src/app/api/activity-feed/route.ts`
- Create: `src/app/api/activity-feed/unread-count/route.ts`

- [ ] **Step 1: Write tests**

Create `tests/evals/activity-feed-api.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("GET /api/activity-feed", () => {
  it("returns 403 without auth", async () => {
    // Unauthenticated request → 403
  });

  it("returns feed items sorted by createdAt DESC", async () => {
    // Authenticated request → { success: true, items: FeedItem[] }
  });

  it("respects limit query param", async () => {
    // ?limit=5 → max 5 items
  });
});

describe("GET /api/activity-feed/unread-count", () => {
  it("returns unread count", async () => {
    // → { success: true, count: number }
  });
});

describe("POST /api/activity-feed/mark-viewed", () => {
  it("updates last_feed_viewed_at", async () => {
    // POST → { success: true }
    // Subsequent unread-count → 0
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/activity-feed-api.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement GET /api/activity-feed**

```typescript
// src/app/api/activity-feed/route.ts
import { NextResponse } from "next/server";
import { getActivityFeed, markFeedViewed } from "@/lib/services/activity-feed-service";
// Use the same auth pattern as /api/connectors/status/route.ts
// Import the auth helper used in this codebase (resolveAuthenticatedConnectorScope or equivalent)

export async function GET(req: Request) {
  // Auth: resolve ownerKey from session (same pattern as connectors/status)
  const scope = /* resolve auth scope from request */;
  if (!scope) {
    return NextResponse.json({ success: false, error: "AUTH_REQUIRED" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "30", 10);

  const items = getActivityFeed(scope.cognitiveOwnerKey, { limit });
  return NextResponse.json({ success: true, items });
}

```

> **Note to implementer:** Use the exact same auth resolution pattern as `src/app/api/connectors/status/route.ts`. Import the same helper function. The ownerKey field name may be `cognitiveOwnerKey` or `ownerKey` depending on the scope object shape — check the existing route for the exact property.

- [ ] **Step 4: Implement GET /api/activity-feed/unread-count**

```typescript
// src/app/api/activity-feed/unread-count/route.ts
import { NextResponse } from "next/server";
import { getUnreadCount } from "@/lib/services/activity-feed-service";

export async function GET(req: Request) {
  const scope = /* resolve auth scope */;
  if (!scope) {
    return NextResponse.json({ success: false, error: "AUTH_REQUIRED" }, { status: 403 });
  }

  const count = getUnreadCount(scope.cognitiveOwnerKey);
  return NextResponse.json({ success: true, count });
}
```

- [ ] **Step 5: Implement POST /api/activity-feed/mark-viewed (separate route file)**

```typescript
// src/app/api/activity-feed/mark-viewed/route.ts
import { NextResponse } from "next/server";
import { markFeedViewed } from "@/lib/services/activity-feed-service";

export async function POST(req: Request) {
  const scope = /* resolve auth scope */;
  if (!scope) {
    return NextResponse.json({ success: false, error: "AUTH_REQUIRED" }, { status: 403 });
  }

  markFeedViewed(scope.cognitiveOwnerKey);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/evals/activity-feed-api.test.ts`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/api/activity-feed/route.ts src/app/api/activity-feed/unread-count/route.ts src/app/api/activity-feed/mark-viewed/route.ts tests/evals/activity-feed-api.test.ts
git commit -m "feat: activity feed API routes (GET list, GET unread-count, POST mark-viewed)"
```

---

### Task 6: Agent Context Integration

**Files:**
- Modify: `src/lib/agent/context.ts`

- [ ] **Step 1: Write test for pageStateBlock extension**

Add to `tests/evals/activity-feed-context.test.ts`:

```typescript
describe("pageStateBlock with activity feed", () => {
  it("includes RECENT ACTIVITY when sync items exist", () => {
    // Setup: create connector + sync_log entries
    // Act: call assembleContext (or the specific block builder)
    // Assert: pageState content includes "RECENT ACTIVITY"
  });

  it("includes PENDING ACTIONS when proposals exist", () => {
    // Setup: create pending soul_change_proposals
    // Assert: pageState content includes "PENDING ACTIONS"
  });

  it("omits activity section for first_visit journey state", () => {
    // Assert: first_visit profile does NOT include activity in pageState
  });

  it("stays within pageState 1500 token budget", () => {
    // Create many items, verify total pageState block doesn't overflow
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/activity-feed-context.test.ts`
Expected: New tests FAIL

- [ ] **Step 3: Extend pageStateBlock in assembleContext**

In `src/lib/agent/context.ts`, find the section where `pageStateBlock` is built. Add after existing pageState content:

```typescript
import { getActivityFeed } from "@/lib/services/activity-feed-service";
import { formatFeedForContext } from "@/lib/services/activity-feed-formatters";

// Inside the pageState block builder, after existing content:
// Only include for steady_state modes (not first_visit, not blocked)
if (mode === "steady_state") {
  const feedItems = getActivityFeed(ownerKey, {
    limit: 15,
    since: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  });
  const activityContext = formatFeedForContext(feedItems);
  if (activityContext) {
    pageStateContent += "\n\n" + activityContext;
  }
}
```

> **Note to implementer:** The pageStateBlock has a 1500 token budget. The activity context adds ~200 tokens max. Verify that the existing pageState content + activity context fits within budget. If it overflows, the existing shrink loop will handle it — but confirm this by checking `estimateTokens()` on the combined output. The `mode` variable (onboarding vs steady_state) is already available in `assembleContext` via `mapJourneyStateToMode()`. Exclude activity context for `first_visit` and `blocked` journey states.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/evals/activity-feed-context.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/context.ts tests/evals/activity-feed-context.test.ts
git commit -m "feat: inject activity feed summary into agent pageStateBlock"
```

---

## Chunk 3: UI Components — Mobile-First

### Task 7: L10N Keys

**Files:**
- Modify: `src/lib/i18n/ui-strings.ts`

- [ ] **Step 1: Add activity feed keys to UiStrings interface**

Add these keys to the `UiStrings` interface:

```typescript
// Activity Feed — static labels only. Dynamic strings (sync titles with
// connector names and counts) are built programmatically in FeedItem.tsx
// using the positional {0} pattern: e.g., activitySynced = "synced"
activityTitle: string;          // "Activity" / "Attività"
activityEmpty: string;          // "Nothing new" / "Nessuna novità"
activityMarkAllRead: string;    // "Mark all read" / "Segna tutto come letto"
activitySynced: string;         // "synced" / "sincronizzato" (used: "GitHub synced: 3 facts, 2 events")
activitySyncFailed: string;     // "sync failed" / "sincronizzazione fallita"
activityFacts: string;          // "facts" / "fatti"
activityEvents: string;         // "events" / "eventi"
activityConformity: string;     // "Page improvement suggested" / "Miglioramento pagina suggerito"
activitySoul: string;           // "Soul change proposed" / "Modifica soul proposta"
activityEpisodicPattern: string;// "Pattern detected" / "Pattern rilevato"
activityAccept: string;         // "Accept" / "Accetta"
activityReject: string;         // "Reject" / "Rifiuta"
activityResolved: string;       // "Resolved" / "Risolto"
activityCurrent: string;        // "Current" / "Attuale"
activityProposed: string;       // "Proposed" / "Proposto"
activityReason: string;         // "Reason" / "Motivo"
activitySeverity: string;       // "Severity" / "Gravità"
```

> **Note to implementer:** Sync titles are built programmatically in `FeedItem.tsx` using the codebase's positional pattern, NOT L10N template strings:
> ```typescript
> // Example: "GitHub synced: 3 facts, 2 events"
> const title = `${connectorLabel} ${t.activitySynced}: ${d.factsCreated} ${t.activityFacts}, ${d.eventsCreated} ${t.activityEvents}`;
> ```

- [ ] **Step 2: Add translations for all 8 languages**

Add the corresponding values in each language object (en, it, de, fr, es, pt, ja, zh). Follow the exact pattern of existing keys in the file.

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/ui-strings.ts
git commit -m "feat: L10N keys for activity feed (15 keys × 8 languages)"
```

---

### Task 8: useUnreadCount Hook

**Files:**
- Create: `src/hooks/useUnreadCount.ts`

- [ ] **Step 1: Implement hook**

```typescript
// src/hooks/useUnreadCount.ts
import { useState, useEffect, useCallback } from "react";

/**
 * Fetches unread notification count.
 * Revalidates on:
 * - Window focus (visibilitychange)
 * - Manual refresh() call (after user actions like sync, proposal accept)
 */
export function useUnreadCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/activity-feed/unread-count");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setCount(data.count);
      }
    } catch {
      // Silently ignore — badge just won't update
    }
  }, []);

  useEffect(() => {
    refresh();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refresh]);

  return { count, refresh };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useUnreadCount.ts
git commit -m "feat: useUnreadCount hook with focus-based revalidation"
```

---

### Task 9: NotificationBell Component

**Files:**
- Create: `src/components/notifications/NotificationBell.tsx`

- [ ] **Step 1: Implement bell with badge**

```typescript
// src/components/notifications/NotificationBell.tsx
"use client";

import { forwardRef, type CSSProperties } from "react";

interface NotificationBellProps {
  count: number;
  onClick: () => void;
}

export const NotificationBell = forwardRef<HTMLButtonElement, NotificationBellProps>(
  function NotificationBell({ count, onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `${count} notifications` : "Notifications"}
      style={bellStyle}
    >
      {/* Bell SVG icon — 20×20 */}
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M10 2C7.24 2 5 4.24 5 7V10.5L3.5 13V14H16.5V13L15 10.5V7C15 4.24 12.76 2 10 2Z"
          fill="currentColor"
          opacity="0.85"
        />
        <path d="M8.5 15C8.5 15.83 9.17 16.5 10 16.5C10.83 16.5 11.5 15.83 11.5 15H8.5Z" fill="currentColor" />
      </svg>

      {/* Badge */}
      {count > 0 && (
        <span style={badgeStyle}>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
});

const bellStyle: CSSProperties = {
  position: "relative",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "rgba(255,255,255,0.7)",
  padding: "8px",
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "color 0.15s, background 0.15s",
};

const badgeStyle: CSSProperties = {
  position: "absolute",
  top: 2,
  right: 2,
  background: "#e53e3e",
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 4px",
  lineHeight: 1,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/notifications/NotificationBell.tsx
git commit -m "feat: NotificationBell component with badge"
```

---

### Task 10: ActivityDrawer — Mobile-First

**Files:**
- Create: `src/components/notifications/ActivityDrawer.tsx`

This is the most critical UI component. **Mobile-first design.**

- [ ] **Step 1: Implement drawer shell**

```typescript
// src/components/notifications/ActivityDrawer.tsx
"use client";

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { FeedItemComponent } from "./FeedItem";
import type { FeedItem } from "@/lib/services/activity-feed-types";
import type { UiStrings } from "@/lib/i18n/ui-strings";

interface ActivityDrawerProps {
  open: boolean;
  onClose: () => void;
  language: string;
  t: UiStrings;
  isMobile: boolean;
  onUnreadRefresh: () => void; // call after mark-viewed
  bellRef?: React.RefObject<HTMLButtonElement | null>; // to exclude bell from outside-click
}

export function ActivityDrawer({
  open,
  onClose,
  language,
  t,
  isMobile,
  onUnreadRefresh,
  bellRef,
}: ActivityDrawerProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Fetch feed + mark as viewed on open
  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/activity-feed?limit=30");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setItems(data.items);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchFeed();
      // Mark as viewed after short delay (user has seen the list)
      const timer = setTimeout(async () => {
        try {
          await fetch("/api/activity-feed/mark-viewed", { method: "POST" });
          onUnreadRefresh();
        } catch { /* silent */ }
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setExpandedId(null);
    }
  }, [open, fetchFeed, onUnreadRefresh]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Close on click outside (desktop only) — excludes bell button via bellRef
  useEffect(() => {
    if (!open || isMobile) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      // Don't close if clicking the bell button (it handles its own toggle)
      if (bellRef?.current?.contains(target)) return;
      if (drawerRef.current && !drawerRef.current.contains(target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, isMobile, onClose, bellRef]);

  const handleItemAction = useCallback(() => {
    // Refresh feed after proposal accept/reject
    fetchFeed();
    onUnreadRefresh();
  }, [fetchFeed, onUnreadRefresh]);

  if (!open) return null;

  const drawerStyle: CSSProperties = isMobile
    ? {
        // MOBILE: full-screen overlay
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#0e0e10",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }
    : {
        // DESKTOP: right-side panel 480px
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 480,
        zIndex: 70,
        background: "#0e0e10",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        overflowY: "auto",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
      };

  return (
    <>
      {/* Desktop backdrop */}
      {!isMobile && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 60,
          }}
        />
      )}

      <div ref={drawerRef} style={drawerStyle}>
        {/* Header */}
        <div style={headerStyle(isMobile)}>
          {/* Close button (left on mobile, right on desktop) */}
          {isMobile && (
            <button type="button" onClick={onClose} style={closeButtonStyle}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M12.7 5.3a1 1 0 00-1.4 0L7 9.6a.5.5 0 000 .7l4.3 4.4a1 1 0 001.4-1.4L9.4 10l3.3-3.3a1 1 0 000-1.4z" />
              </svg>
            </button>
          )}

          <h2 style={titleStyle}>{t.activityTitle}</h2>

          <div style={{ flex: 1 }} />

          {/* Mark all read — only show if there are items */}
          {items.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/activity-feed/mark-viewed", { method: "POST" });
                onUnreadRefresh();
              }}
              style={markAllReadStyle}
            >
              {t.activityMarkAllRead}
            </button>
          )}

          {/* Close button desktop */}
          {!isMobile && (
            <button type="button" onClick={onClose} style={closeButtonStyle}>
              ✕
            </button>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: isMobile ? "0 16px 24px" : "0 20px 24px" }}>
          {loading && items.length === 0 && (
            <div style={emptyStyle}>{/* Loading skeleton or spinner */}
              <div style={{ opacity: 0.4 }}>...</div>
            </div>
          )}

          {!loading && items.length === 0 && (
            <div style={emptyStyle}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>○</div>
              <div style={{ opacity: 0.5, fontSize: 14 }}>{t.activityEmpty}</div>
            </div>
          )}

          {items.map((item) => (
            <FeedItemComponent
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onAction={handleItemAction}
              language={language}
              t={t}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// --- Styles ---

function headerStyle(isMobile: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: isMobile ? "16px 16px 12px" : "20px 20px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    position: "sticky",
    top: 0,
    background: "#0e0e10",
    zIndex: 1,
  };
}

const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "rgba(255,255,255,0.9)",
  margin: 0,
};

const closeButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.5)",
  cursor: "pointer",
  padding: 10,
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16,
  minWidth: 44,  // iOS accessibility minimum
  minHeight: 44,
};

const markAllReadStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.4)",
  cursor: "pointer",
  fontSize: 12,
  padding: "4px 8px",
};

const emptyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  paddingTop: 80,
  color: "rgba(255,255,255,0.5)",
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/notifications/ActivityDrawer.tsx
git commit -m "feat: ActivityDrawer — mobile full-screen, desktop 480px panel"
```

---

### Task 11: FeedItem + FeedItemDetail

**Files:**
- Create: `src/components/notifications/FeedItem.tsx`
- Create: `src/components/notifications/FeedItemDetail.tsx`

- [ ] **Step 1: Implement FeedItem**

```typescript
// src/components/notifications/FeedItem.tsx
"use client";

import type { CSSProperties } from "react";
import type { FeedItem as FeedItemType } from "@/lib/services/activity-feed-types";
import type { UiStrings } from "@/lib/i18n/ui-strings";
import { FeedItemDetail } from "./FeedItemDetail";

interface FeedItemComponentProps {
  item: FeedItemType;
  expanded: boolean;
  onToggle: () => void;
  onAction: () => void;
  language: string;
  t: UiStrings;
}

function relativeTimeDisplay(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const CONNECTOR_LABELS: Record<string, string> = {
  github: "GitHub",
  linkedin_zip: "LinkedIn",
  rss: "RSS",
  spotify: "Spotify",
  strava: "Strava",
};

function getItemTitle(item: FeedItemType, t: UiStrings): string {
  const d = item.detail;
  switch (d.type) {
    case "connector_sync": {
      const label = CONNECTOR_LABELS[d.connectorType] ?? d.connectorType;
      // Build programmatically using L10N fragments (codebase pattern)
      return `${label} ${t.activitySynced}: ${d.factsCreated} ${t.activityFacts}, ${d.eventsCreated} ${t.activityEvents}`;
    }
    case "connector_error": {
      const label = CONNECTOR_LABELS[d.connectorType] ?? d.connectorType;
      return `${label} ${t.activitySyncFailed}`;
    }
    case "conformity_proposal":
      return t.activityConformity;
    case "soul_proposal":
      return t.activitySoul;
    case "episodic_pattern":
      return t.activityEpisodicPattern;
    default:
      return "Notification";
  }
}

const TYPE_ICONS: Record<string, string> = {
  connector_sync: "↻",
  connector_error: "⚠",
  conformity_proposal: "✦",
  soul_proposal: "◈",
  episodic_pattern: "◉",
};

export function FeedItemComponent({
  item,
  expanded,
  onToggle,
  onAction,
  language,
  t,
}: FeedItemComponentProps) {
  const isResolved = item.status && item.status !== "pending";

  return (
    <div style={containerStyle}>
      {/* Summary row — always visible, tap to expand */}
      <button
        type="button"
        onClick={onToggle}
        style={summaryRowStyle}
      >
        {/* Icon */}
        <span style={iconStyle(item.category)}>
          {TYPE_ICONS[item.type] ?? "•"}
        </span>

        {/* Title + time */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={titleRowStyle(isResolved)}>
            {getItemTitle(item, t)}
          </div>
          {item.connectorType && (
            <div style={subtitleStyle}>
              {CONNECTOR_LABELS[item.connectorType] ?? item.connectorType}
            </div>
          )}
        </div>

        {/* Time + chevron */}
        <div style={timeStyle}>
          {relativeTimeDisplay(item.createdAt)}
        </div>
        <span style={chevronStyle(expanded)}>›</span>
      </button>

      {/* Detail — shown when expanded */}
      {expanded && (
        <FeedItemDetail
          item={item}
          onAction={onAction}
          language={language}
          t={t}
        />
      )}

      {/* Resolved badge */}
      {isResolved && (
        <div style={resolvedBadgeStyle}>
          {t.activityResolved} ✓
        </div>
      )}
    </div>
  );
}

// --- Styles ---

const containerStyle: CSSProperties = {
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  position: "relative",
};

const summaryRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "14px 0",  // Tall touch target (min 44px with content)
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "rgba(255,255,255,0.85)",
  textAlign: "left",
  fontSize: 14,
};

function iconStyle(category: string): CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    flexShrink: 0,
    background:
      category === "actionable"
        ? "rgba(201,169,110,0.15)"
        : "rgba(255,255,255,0.06)",
    color:
      category === "actionable"
        ? "#c9a96e"
        : "rgba(255,255,255,0.5)",
  };
}

function titleRowStyle(resolved?: boolean): CSSProperties {
  return {
    fontSize: 14,
    fontWeight: 500,
    color: resolved ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.85)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textDecoration: resolved ? "line-through" : "none",
  };
}

const subtitleStyle: CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.3)",
  marginTop: 2,
};

const timeStyle: CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.3)",
  flexShrink: 0,
  minWidth: 28,
  textAlign: "right",
};

function chevronStyle(expanded: boolean): CSSProperties {
  return {
    fontSize: 16,
    color: "rgba(255,255,255,0.2)",
    transform: expanded ? "rotate(90deg)" : "none",
    transition: "transform 0.15s",
    flexShrink: 0,
  };
}

const resolvedBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 14,
  right: 0,
  fontSize: 10,
  color: "rgba(80,200,120,0.7)",
  fontWeight: 600,
};
```

- [ ] **Step 2: Implement FeedItemDetail**

```typescript
// src/components/notifications/FeedItemDetail.tsx
"use client";

import { FeedItemActions } from "./FeedItemActions";
import type { FeedItem } from "@/lib/services/activity-feed-types";
import type { UiStrings } from "@/lib/i18n/ui-strings";
import type { CSSProperties } from "react";

interface FeedItemDetailProps {
  item: FeedItem;
  onAction: () => void;
  language: string;
  t: UiStrings;
}

export function FeedItemDetail({ item, onAction, language, t }: FeedItemDetailProps) {
  const d = item.detail;

  return (
    <div style={detailContainerStyle}>
      {/* Connector sync detail */}
      {d.type === "connector_sync" && (
        <div>
          <DetailRow label="Facts" value={`${d.factsCreated} created, ${d.factsUpdated} updated`} />
          <DetailRow label="Events" value={`${d.eventsCreated} created`} />
        </div>
      )}

      {/* Connector error detail */}
      {d.type === "connector_error" && (
        <div>
          <DetailRow label="Error" value={d.error} />
          {d.lastSuccessfulSync && (
            <DetailRow label="Last success" value={new Date(d.lastSuccessfulSync).toLocaleDateString(language)} />
          )}
        </div>
      )}

      {/* Conformity proposal detail */}
      {d.type === "conformity_proposal" && (
        <div>
          <DetailRow label={t.activitySeverity} value={d.severity} />
          <DetailRow label={t.activityReason} value={d.reason} />

          <div style={diffContainerStyle}>
            <div style={diffBlockStyle}>
              <div style={diffLabelStyle}>{t.activityCurrent}</div>
              <div style={diffContentStyle}>{d.currentContent}</div>
            </div>
            <div style={diffBlockStyle}>
              <div style={{ ...diffLabelStyle, color: "rgba(80,200,120,0.8)" }}>{t.activityProposed}</div>
              <div style={diffContentStyle}>{d.proposedContent}</div>
            </div>
          </div>

          {item.status === "pending" && (
            <FeedItemActions
              item={item}
              onAction={onAction}
              t={t}
            />
          )}
        </div>
      )}

      {/* Soul proposal detail */}
      {d.type === "soul_proposal" && (
        <div>
          {d.reason && <DetailRow label={t.activityReason} value={d.reason} />}
          <div style={diffContainerStyle}>
            <div style={diffBlockStyle}>
              <div style={{ ...diffLabelStyle, color: "rgba(80,200,120,0.8)" }}>{t.activityProposed}</div>
              <div style={diffContentStyle}>
                {Object.entries(d.proposedOverlay).map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 4 }}>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>{k}:</span>{" "}
                    <span>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {item.status === "pending" && (
            <FeedItemActions
              item={item}
              onAction={onAction}
              t={t}
            />
          )}
        </div>
      )}

      {/* Episodic pattern detail */}
      {d.type === "episodic_pattern" && (
        <div>
          <DetailRow label="Pattern" value={d.patternSummary} />
          <DetailRow label="Events" value={`${d.eventCount} occurrences`} />

          {item.status === "pending" && (
            <FeedItemActions
              item={item}
              onAction={onAction}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={detailRowStyle}>
      <span style={detailLabelStyle}>{label}</span>
      <span style={detailValueStyle}>{value}</span>
    </div>
  );
}

// --- Styles ---

const detailContainerStyle: CSSProperties = {
  padding: "0 0 14px 44px", // aligned with text (past icon)
};

const detailRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 6,
  fontSize: 13,
};

const detailLabelStyle: CSSProperties = {
  color: "rgba(255,255,255,0.35)",
  minWidth: 70,
  flexShrink: 0,
};

const detailValueStyle: CSSProperties = {
  color: "rgba(255,255,255,0.7)",
  wordBreak: "break-word",
};

const diffContainerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 10,
  marginBottom: 12,
};

const diffBlockStyle: CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  borderRadius: 8,
  padding: "10px 12px",
};

const diffLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "rgba(255,255,255,0.35)",
  marginBottom: 6,
};

const diffContentStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: "rgba(255,255,255,0.7)",
};
```

- [ ] **Step 3: Commit**

```bash
git add src/components/notifications/FeedItem.tsx src/components/notifications/FeedItemDetail.tsx
git commit -m "feat: FeedItem + FeedItemDetail components (mobile-first)"
```

---

### Task 12: FeedItemActions (Proposal Accept/Reject)

**Files:**
- Create: `src/components/notifications/FeedItemActions.tsx`

- [ ] **Step 1: Implement action buttons**

```typescript
// src/components/notifications/FeedItemActions.tsx
"use client";

import { useState, type CSSProperties } from "react";
import type { FeedItem } from "@/lib/services/activity-feed-types";
import type { UiStrings } from "@/lib/i18n/ui-strings";

interface FeedItemActionsProps {
  item: FeedItem;
  onAction: () => void;
  t: UiStrings;
}

/**
 * Accept/Reject buttons for actionable proposals.
 * Routes to existing APIs:
 * - conformity_proposal → POST /api/proposals/{id}/accept or /reject
 * - soul_proposal → POST /api/soul/review { proposalId, accept }
 * - episodic_pattern → POST /api/episodic/confirm { id, accept } (verify actual route)
 */
export function FeedItemActions({ item, onAction, t }: FeedItemActionsProps) {
  const [loading, setLoading] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (accept: boolean) => {
    setLoading(accept ? "accept" : "reject");
    setError(null);

    try {
      const d = item.detail;
      let res: Response;

      if (d.type === "conformity_proposal") {
        const endpoint = accept
          ? `/api/proposals/${d.proposalId}/accept`
          : `/api/proposals/${d.proposalId}/reject`;
        res = await fetch(endpoint, { method: "POST" });
      } else if (d.type === "soul_proposal") {
        res = await fetch("/api/soul/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposalId: d.proposalId, accept }),
        });
      } else if (d.type === "episodic_pattern") {
        // Verify the actual API route for episodic pattern confirmation
        // It may be an agent tool only — check if an HTTP endpoint exists
        // If not, this action should go through the chat agent
        res = await fetch("/api/episodic/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: d.proposalId, accept }),
        });
      } else {
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }

      onAction(); // Refresh feed
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={actionsContainerStyle}>
      {error && <div style={errorStyle}>{error}</div>}
      <div style={buttonsRowStyle}>
        <button
          type="button"
          onClick={() => handleAction(true)}
          disabled={loading !== null}
          style={acceptButtonStyle}
        >
          {loading === "accept" ? "…" : t.activityAccept}
        </button>
        <button
          type="button"
          onClick={() => handleAction(false)}
          disabled={loading !== null}
          style={rejectButtonStyle}
        >
          {loading === "reject" ? "…" : t.activityReject}
        </button>
      </div>
    </div>
  );
}

// --- Styles ---

const actionsContainerStyle: CSSProperties = {
  marginTop: 8,
};

const buttonsRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
};

const acceptButtonStyle: CSSProperties = {
  padding: "14px 20px", // ≥44px touch target (14+13+14=41px + border = 43px)
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  background: "rgba(80,200,120,0.15)",
  color: "rgba(80,200,120,0.9)",
  border: "1px solid rgba(80,200,120,0.2)",
  cursor: "pointer",
  flex: 1,
  minHeight: 44, // iOS accessibility minimum
};

const rejectButtonStyle: CSSProperties = {
  padding: "14px 20px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.4)",
  border: "1px solid rgba(255,255,255,0.08)",
  cursor: "pointer",
  flex: 1,
  minHeight: 44,
};

const errorStyle: CSSProperties = {
  fontSize: 12,
  color: "#e53e3e",
  marginBottom: 6,
};
```

> **Note to implementer:** The episodic pattern confirmation might only exist as an agent tool (`confirm_episodic_pattern`), not as an HTTP endpoint. If no `/api/episodic/confirm` route exists, you must create one:
> - Create `src/app/api/episodic/confirm/route.ts`
> - Import `acceptEpisodicProposalAsActivity` from `src/lib/services/episodic-service.ts`
> - Auth-scoped POST handler that calls the service function
> - This is a small addition (~20 lines) following the soul review route pattern

- [ ] **Step 2: Commit**

```bash
git add src/components/notifications/FeedItemActions.tsx
git commit -m "feat: FeedItemActions — Accept/Reject for proposals in activity drawer"
```

---

### Task 13: Integration in SplitView + BuilderNavBar

**Files:**
- Modify: `src/components/layout/BuilderNavBar.tsx`
- Modify: `src/components/layout/SplitView.tsx`

- [ ] **Step 1: Add props to BuilderNavBar**

Add to `BuilderNavBarProps`:

```typescript
unreadCount?: number;
onActivityOpen?: () => void;
bellRef?: React.RefObject<HTMLButtonElement | null>;
```

Add `NotificationBell` between the spacer (`flex: 1` div) and the Presence button:

```typescript
import { NotificationBell } from "@/components/notifications/NotificationBell";

// In the JSX, after the spacer div and before the Presence button:
{onActivityOpen && (
  <NotificationBell
    ref={bellRef}
    count={unreadCount ?? 0}
    onClick={onActivityOpen}
  />
)}
```

- [ ] **Step 2: Add activity drawer state to SplitView**

In `SplitView.tsx`, add state and render:

```typescript
import { useState, useCallback, useRef } from "react";
import { ActivityDrawer } from "@/components/notifications/ActivityDrawer";
import { useUnreadCount } from "@/hooks/useUnreadCount";

// Inside SplitView component:
const [activityOpen, setActivityOpen] = useState(false);
const bellRef = useRef<HTMLButtonElement>(null);
const { count: unreadCount, refresh: refreshUnread } = useUnreadCount();

// Determine isMobile (follow existing pattern in SplitView)
// SplitView already detects mobile via container width or similar check
// Use the same detection for ActivityDrawer

// Pass to BuilderNavBar:
<BuilderNavBar
  // ...existing props
  unreadCount={unreadCount}
  onActivityOpen={() => setActivityOpen(prev => !prev)}
  bellRef={bellRef}
/>

// Render ActivityDrawer (alongside PresencePanel):
<ActivityDrawer
  open={activityOpen}
  onClose={() => setActivityOpen(false)}
  language={language}
  t={t}
  isMobile={/* same mobile detection as PresencePanel */}
  onUnreadRefresh={refreshUnread}
  bellRef={bellRef}
/>
```

> **Note to implementer:** SplitView already has mobile detection logic. Look at how `PresencePanel` receives its `inlineFullscreen` prop — the same condition should drive `ActivityDrawer`'s `isMobile` prop. The drawer must close when PresencePanel opens (and vice versa) — add mutual exclusion: `setPresenceOpen(false)` when opening activity, `setActivityOpen(false)` when opening presence.

- [ ] **Step 3: Mobile mutual exclusion**

Ensure only one panel is open at a time:

```typescript
const handleActivityOpen = useCallback(() => {
  setPresenceOpen(false); // close presence if open
  setActivityOpen(true);
}, []);

const handlePresenceOpen = useCallback(() => {
  setActivityOpen(false); // close activity if open
  setPresenceOpen(true);
}, []);
```

Wire `handleActivityOpen` to BuilderNavBar's `onActivityOpen` and `handlePresenceOpen` to the existing Presence button handler.

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Visual test — mobile**

Run: `npm run dev`
Open on mobile viewport (375px width). Verify:
- Bell visible in navbar with badge
- Tap bell → full-screen drawer opens over everything
- Back arrow in header closes drawer
- Items are touch-friendly (min 44px height)
- Drawer scrolls smoothly
- Expanding an item shows detail inline
- Accept/Reject buttons are large and tappable
- No content overflow or horizontal scroll

- [ ] **Step 6: Visual test — desktop**

Open on desktop viewport (1280px+). Verify:
- Bell visible in navbar between spacer and Presence button
- Click bell → 480px drawer slides in from right with backdrop
- Click outside or Escape closes drawer
- Presence and Activity drawers are mutually exclusive
- Content is readable, no cramped layouts

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/BuilderNavBar.tsx src/components/layout/SplitView.tsx
git commit -m "feat: integrate NotificationBell + ActivityDrawer in builder UI"
```

---

## Chunk 4: Polish + Verification

### Task 14: Episodic Confirm API Route (if needed)

**Files:**
- Create: `src/app/api/episodic/confirm/route.ts` (only if no existing HTTP endpoint)

- [ ] **Step 1: Check if endpoint exists**

Search for existing episodic confirmation HTTP endpoint:
```bash
grep -r "episodic" src/app/api/ --include="*.ts" -l
```

If an endpoint like `/api/episodic/confirm` or `/api/episodic/review` already exists, skip this task.

- [ ] **Step 2: Create endpoint if missing**

```typescript
// src/app/api/episodic/confirm/route.ts
import { NextResponse } from "next/server";
import { acceptEpisodicProposalAsActivity } from "@/lib/services/episodic-service";
// Use same auth pattern as /api/soul/review/route.ts

export async function POST(req: Request) {
  const scope = /* resolve auth scope */;
  if (!scope) {
    return NextResponse.json({ success: false, error: "AUTH_REQUIRED" }, { status: 403 });
  }

  const body = await req.json();
  const { id, accept } = body;

  if (!id || typeof accept !== "boolean") {
    return NextResponse.json({ success: false, error: "INVALID_PARAMS" }, { status: 400 });
  }

  if (accept) {
    const result = acceptEpisodicProposalAsActivity(
      id,
      scope.cognitiveOwnerKey,
      scope.sessionId ?? "api",
      scope.profileId
    );
    if (!result) {
      return NextResponse.json({ success: false, error: "PROPOSAL_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ success: true, factId: result.factId });
  } else {
    // Reject: update status to 'rejected', set cooldown
    // Check episodic-service.ts for a reject function
    // If none exists, implement inline: UPDATE status='rejected', rejectionCooldownUntil = now+90d
    return NextResponse.json({ success: true });
  }
}
```

> **Note to implementer:** Check `src/lib/services/episodic-service.ts` for an existing reject function. The `confirm_episodic_pattern` agent tool handler likely has the reject logic — extract it into a reusable service function if not already exported.

- [ ] **Step 3: Commit** (if new file created)

```bash
git add src/app/api/episodic/confirm/route.ts
git commit -m "feat: HTTP endpoint for episodic pattern confirmation"
```

---

### Task 15: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing 2910 + new tests)

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify EXPECTED_SCHEMA_VERSION is 32**

Search and confirm:
```bash
grep -r "EXPECTED_SCHEMA_VERSION" src/ --include="*.ts"
```
Expected: Value is `32`

- [ ] **Step 4: End-to-end smoke test**

Run `npm run dev`. In a browser:

1. Log in as an existing user with connectors configured
2. Verify bell appears in navbar (both mobile and desktop viewports)
3. If there are pending proposals or recent sync logs, badge shows count
4. Click bell → drawer opens with feed items
5. Expand a connector sync item → shows fact/event counts
6. If a conformity proposal exists, expand it → shows current/proposed diff + Accept/Reject
7. Accept a proposal → item shows "Resolved ✓"
8. Close drawer → badge count decreases
9. Open chat → ask agent "what notifications do I have?" → agent references recent activity from context

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: activity feed — unified notification system

Derived feed from existing tables (sync_log, proposals).
Mobile-first ActivityDrawer (full-screen) + desktop (480px panel).
NotificationBell with focus-based revalidation.
Agent context via pageStateBlock extension.
Migration 0032: last_feed_viewed_at on profiles."
```

---

## Key Implementation Notes

### Mobile-First Priorities
- **Full-screen drawer on mobile** — `position: fixed; inset: 0; z-index: 200`
- **Large touch targets** — all interactive elements ≥44px height
- **Safe area insets** — `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`
- **Smooth scrolling** — `-webkit-overflow-scrolling: touch`
- **No nested scroll** — detail expands inline, no scroll-in-scroll
- **Mutual exclusion** — ActivityDrawer and PresencePanel never open simultaneously

### Auth Pattern
All API routes must use the same auth resolution as `src/app/api/connectors/status/route.ts`. Never expose data without owner scoping.

### Existing APIs for Proposal Actions
- Conformity: `POST /api/proposals/{id}/accept`, `POST /api/proposals/{id}/reject`
- Soul: `POST /api/soul/review` with `{ proposalId, accept }`
- Episodic: Create new route if needed (Task 14)

### No New Context Block
Activity feed is injected into the **existing** `pageStateBlock` (1500 token budget). The `formatFeedForContext()` function produces max ~200 tokens. Only injected for `steady_state` mode (not `first_visit`, not `blocked`).
