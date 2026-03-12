import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import {
  getSyncFeedItems,
  getConformityFeedItems,
  getSoulFeedItems,
  getEpisodicFeedItems,
  getActivityFeed,
  getUnreadCount,
  markFeedViewed,
  FEED_WINDOW_DAYS,
} from "@/lib/services/activity-feed-service";

// ---------------------------------------------------------------------------
// In-memory SQLite setup
// ---------------------------------------------------------------------------

const testSqlite = new Database(":memory:");
testSqlite.pragma("journal_mode = WAL");
testSqlite.pragma("foreign_keys = ON");

testSqlite.exec(`
  CREATE TABLE connectors (
    id TEXT PRIMARY KEY,
    connector_type TEXT NOT NULL,
    credentials TEXT,
    config TEXT,
    last_sync TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    owner_key TEXT,
    status TEXT NOT NULL DEFAULT 'connected',
    sync_cursor TEXT,
    last_error TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE sync_log (
    id TEXT PRIMARY KEY,
    connector_id TEXT NOT NULL REFERENCES connectors(id),
    status TEXT NOT NULL,
    facts_created INTEGER DEFAULT 0,
    facts_updated INTEGER DEFAULT 0,
    events_created INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE section_copy_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_key TEXT NOT NULL,
    section_type TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    current_content TEXT NOT NULL DEFAULT '',
    proposed_content TEXT NOT NULL DEFAULT '',
    issue_type TEXT NOT NULL DEFAULT 'drift',
    reason TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL DEFAULT 'low',
    status TEXT NOT NULL DEFAULT 'pending',
    facts_hash TEXT NOT NULL DEFAULT '',
    soul_hash TEXT NOT NULL DEFAULT '',
    baseline_state_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    reviewed_at TEXT
  );

  CREATE TABLE soul_change_proposals (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    soul_profile_id TEXT,
    proposed_overlay TEXT NOT NULL DEFAULT '{}',
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT
  );

  CREATE TABLE episodic_pattern_proposals (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    action_type TEXT NOT NULL,
    pattern_summary TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    last_event_at_unix INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TEXT NOT NULL,
    resolved_at TEXT,
    rejection_cooldown_until TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    username TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_feed_viewed_at TEXT
  );
`);

const testDb = drizzle(testSqlite, { schema });
type TestDb = typeof testDb;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoAgo(days: number, extraMs = 0): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000 - extraMs).toISOString();
}

function isoAhead(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function insertConnector(id: string, ownerKey: string, connectorType = "github") {
  testSqlite
    .prepare(
      "INSERT INTO connectors (id, connector_type, owner_key) VALUES (?, ?, ?)",
    )
    .run(id, connectorType, ownerKey);
}

function insertSyncLog(
  id: string,
  connectorId: string,
  status: string,
  createdAt: string,
  opts: {
    factsCreated?: number;
    factsUpdated?: number;
    eventsCreated?: number;
    error?: string;
  } = {},
) {
  testSqlite
    .prepare(
      `INSERT INTO sync_log
        (id, connector_id, status, facts_created, facts_updated, events_created, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      connectorId,
      status,
      opts.factsCreated ?? 0,
      opts.factsUpdated ?? 0,
      opts.eventsCreated ?? 0,
      opts.error ?? null,
      createdAt,
    );
}

function insertConformityProposal(
  ownerKey: string,
  status: string,
  reviewedAt: string | null = null,
) {
  testSqlite
    .prepare(
      `INSERT INTO section_copy_proposals
        (owner_key, section_type, language, current_content, proposed_content,
         issue_type, reason, severity, status, facts_hash, soul_hash, baseline_state_hash, reviewed_at)
        VALUES (?, 'bio', 'en', 'old', 'new', 'drift', 'test reason', 'low', ?, '', '', '', ?)`,
    )
    .run(ownerKey, status, reviewedAt);
}

function insertSoulProposal(
  id: string,
  ownerKey: string,
  status: string,
  resolvedAt: string | null = null,
  overlay: Record<string, unknown> = { voice: "casual" },
) {
  testSqlite
    .prepare(
      `INSERT INTO soul_change_proposals
        (id, owner_key, proposed_overlay, reason, status, resolved_at)
        VALUES (?, ?, ?, 'auto proposal', ?, ?)`,
    )
    .run(id, ownerKey, JSON.stringify(overlay), status, resolvedAt);
}

function insertEpisodicProposal(
  id: string,
  ownerKey: string,
  status: string,
  expiresAt: string,
) {
  testSqlite
    .prepare(
      `INSERT INTO episodic_pattern_proposals
        (id, owner_key, action_type, pattern_summary, event_count, last_event_at_unix, status, expires_at)
        VALUES (?, ?, 'work', 'pattern text', 5, 0, ?, ?)`,
    )
    .run(id, ownerKey, status, expiresAt);
}

function insertProfile(id: string, lastFeedViewedAt: string | null = null) {
  testSqlite
    .prepare(
      `INSERT OR REPLACE INTO profiles (id, last_feed_viewed_at) VALUES (?, ?)`,
    )
    .run(id, lastFeedViewedAt);
}

// ---------------------------------------------------------------------------
// Test teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  testSqlite.exec(`
    DELETE FROM sync_log;
    DELETE FROM connectors;
    DELETE FROM section_copy_proposals;
    DELETE FROM soul_change_proposals;
    DELETE FROM episodic_pattern_proposals;
    DELETE FROM profiles;
  `);
});

// Cast to the production type so service functions accept it
const db = testDb as unknown as typeof import("@/lib/db").db;

// ---------------------------------------------------------------------------
// getSyncFeedItems
// ---------------------------------------------------------------------------

describe("getSyncFeedItems", () => {
  it("returns a connector_sync item for a successful sync within the window", () => {
    insertConnector("c1", "owner1");
    insertSyncLog("sl1", "c1", "success", isoAgo(1), {
      factsCreated: 3,
      factsUpdated: 1,
      eventsCreated: 2,
    });

    const items = getSyncFeedItems("owner1", isoAgo(FEED_WINDOW_DAYS), db);

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("connector_sync");
    expect(items[0].category).toBe("informational");
    expect(items[0].connectorType).toBe("github");
    expect(items[0].title).toBe("");
    const detail = items[0].detail as import("@/lib/services/activity-feed-types").SyncDetail;
    expect(detail.factsCreated).toBe(3);
    expect(detail.factsUpdated).toBe(1);
    expect(detail.eventsCreated).toBe(2);
  });

  it("returns a connector_error item for a failed sync", () => {
    insertConnector("c1", "owner1");
    insertSyncLog("sl1", "c1", "error", isoAgo(1), {
      error: "timeout",
    });

    const items = getSyncFeedItems("owner1", isoAgo(FEED_WINDOW_DAYS), db);

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("connector_error");
    const detail = items[0].detail as import("@/lib/services/activity-feed-types").SyncErrorDetail;
    expect(detail.error).toBe("timeout");
    expect(detail.lastSuccessfulSync).toBeNull();
  });

  it("excludes items older than the since window", () => {
    insertConnector("c1", "owner1");
    insertSyncLog("sl1", "c1", "success", isoAgo(FEED_WINDOW_DAYS + 2));

    const items = getSyncFeedItems("owner1", isoAgo(FEED_WINDOW_DAYS), db);
    expect(items).toHaveLength(0);
  });

  it("excludes items from other owners", () => {
    insertConnector("c1", "owner-other");
    insertSyncLog("sl1", "c1", "success", isoAgo(1));

    const items = getSyncFeedItems("owner1", isoAgo(FEED_WINDOW_DAYS), db);
    expect(items).toHaveLength(0);
  });

  it("returns up to 20 items (limit)", () => {
    insertConnector("c1", "owner1");
    for (let i = 0; i < 25; i++) {
      insertSyncLog(`sl${i}`, "c1", "success", isoAgo(0, i * 60000));
    }

    const items = getSyncFeedItems("owner1", isoAgo(FEED_WINDOW_DAYS), db);
    expect(items.length).toBeLessThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// getConformityFeedItems
// ---------------------------------------------------------------------------

describe("getConformityFeedItems", () => {
  it("returns pending proposals", () => {
    insertConformityProposal("owner1", "pending");
    const items = getConformityFeedItems("owner1", db);

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("conformity_proposal");
    expect(items[0].category).toBe("actionable");
    expect(items[0].status).toBe("pending");
    const detail = items[0].detail as import("@/lib/services/activity-feed-types").ConformityDetail;
    expect(detail.sectionType).toBe("bio");
    expect(detail.reason).toBe("test reason");
  });

  it("returns accepted proposals reviewed within 24h", () => {
    const recentReview = isoAgo(0, 30 * 60 * 1000); // 30 min ago
    insertConformityProposal("owner1", "accepted", recentReview);
    const items = getConformityFeedItems("owner1", db);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("accepted");
  });

  it("excludes rejected proposals reviewed more than 24h ago", () => {
    const oldReview = isoAgo(2); // 2 days ago
    insertConformityProposal("owner1", "rejected", oldReview);
    const items = getConformityFeedItems("owner1", db);
    expect(items).toHaveLength(0);
  });

  it("excludes items from other owners", () => {
    insertConformityProposal("owner-other", "pending");
    const items = getConformityFeedItems("owner1", db);
    expect(items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getSoulFeedItems
// ---------------------------------------------------------------------------

describe("getSoulFeedItems", () => {
  it("returns pending soul proposals", () => {
    insertSoulProposal("sp1", "owner1", "pending");
    const items = getSoulFeedItems("owner1", db);

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("soul_proposal");
    expect(items[0].category).toBe("actionable");
    expect(items[0].id).toBe("sp1");
    const detail = items[0].detail as import("@/lib/services/activity-feed-types").SoulDetail;
    expect(detail.proposedOverlay).toEqual({ voice: "casual" });
  });

  it("returns accepted proposals resolved within 24h", () => {
    const recentResolve = isoAgo(0, 30 * 60 * 1000);
    insertSoulProposal("sp1", "owner1", "accepted", recentResolve);
    const items = getSoulFeedItems("owner1", db);
    expect(items).toHaveLength(1);
  });

  it("excludes proposals resolved more than 24h ago", () => {
    const oldResolve = isoAgo(2);
    insertSoulProposal("sp1", "owner1", "accepted", oldResolve);
    const items = getSoulFeedItems("owner1", db);
    expect(items).toHaveLength(0);
  });

  it("parses proposedOverlay from JSON string correctly", () => {
    insertSoulProposal("sp2", "owner1", "pending", null, {
      tone: "professional",
      values: ["clarity", "empathy"],
    });
    const items = getSoulFeedItems("owner1", db);
    const detail = items[0].detail as import("@/lib/services/activity-feed-types").SoulDetail;
    expect(detail.proposedOverlay.tone).toBe("professional");
    expect(detail.proposedOverlay.values).toEqual(["clarity", "empathy"]);
  });
});

// ---------------------------------------------------------------------------
// getEpisodicFeedItems
// ---------------------------------------------------------------------------

describe("getEpisodicFeedItems", () => {
  it("returns pending non-expired proposals", () => {
    insertEpisodicProposal("ep1", "owner1", "pending", isoAhead(10));
    const items = getEpisodicFeedItems("owner1", db);

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("episodic_pattern");
    expect(items[0].category).toBe("actionable");
    const detail = items[0].detail as import("@/lib/services/activity-feed-types").EpisodicDetail;
    expect(detail.actionType).toBe("work");
    expect(detail.eventCount).toBe(5);
    expect(detail.patternSummary).toBe("pattern text");
  });

  it("excludes expired proposals", () => {
    insertEpisodicProposal("ep1", "owner1", "pending", isoAgo(1));
    const items = getEpisodicFeedItems("owner1", db);
    expect(items).toHaveLength(0);
  });

  it("excludes accepted proposals", () => {
    insertEpisodicProposal("ep1", "owner1", "accepted", isoAhead(10));
    const items = getEpisodicFeedItems("owner1", db);
    expect(items).toHaveLength(0);
  });

  it("excludes items from other owners", () => {
    insertEpisodicProposal("ep1", "owner-other", "pending", isoAhead(10));
    const items = getEpisodicFeedItems("owner1", db);
    expect(items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getActivityFeed
// ---------------------------------------------------------------------------

describe("getActivityFeed", () => {
  it("merges and sorts all sources by createdAt DESC", () => {
    // Connector sync
    insertConnector("c1", "owner1");
    insertSyncLog("sl1", "c1", "success", isoAgo(1));

    // Conformity proposal
    insertConformityProposal("owner1", "pending");

    // Soul proposal
    insertSoulProposal("sp1", "owner1", "pending");

    // Episodic proposal
    insertEpisodicProposal("ep1", "owner1", "pending", isoAhead(10));

    const items = getActivityFeed("owner1", undefined, db);
    expect(items.length).toBeGreaterThanOrEqual(4);

    // Verify sorted descending by createdAt
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].createdAt >= items[i].createdAt).toBe(true);
    }
  });

  it("respects the limit option", () => {
    insertConnector("c1", "owner1");
    for (let i = 0; i < 10; i++) {
      insertSyncLog(`sl${i}`, "c1", "success", isoAgo(0, i * 60000));
    }
    for (let i = 0; i < 10; i++) {
      insertConformityProposal("owner1", "pending");
    }

    const items = getActivityFeed("owner1", { limit: 5 }, db);
    expect(items).toHaveLength(5);
  });

  it("excludes sync items older than since window", () => {
    insertConnector("c1", "owner1");
    // Old sync (beyond 7 days)
    insertSyncLog("sl-old", "c1", "success", isoAgo(FEED_WINDOW_DAYS + 2));
    // Recent sync
    insertSyncLog("sl-new", "c1", "success", isoAgo(1));

    const items = getActivityFeed("owner1", undefined, db);
    const syncItems = items.filter((i) => i.type === "connector_sync");
    expect(syncItems).toHaveLength(1);
    expect(syncItems[0].id).toBe("sl-new");
  });

  it("returns empty array when no items exist", () => {
    const items = getActivityFeed("owner-empty", undefined, db);
    expect(items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getUnreadCount
// ---------------------------------------------------------------------------

describe("getUnreadCount", () => {
  it("returns 0 when there are no items", () => {
    const count = getUnreadCount("owner1", db);
    expect(count).toBe(0);
  });

  it("counts sync log items since window floor when no lastFeedViewedAt", () => {
    insertConnector("c1", "owner1");
    insertSyncLog("sl1", "c1", "success", isoAgo(1));
    insertSyncLog("sl2", "c1", "error", isoAgo(2));
    // Old one outside window
    insertSyncLog("sl-old", "c1", "success", isoAgo(FEED_WINDOW_DAYS + 2));

    const count = getUnreadCount("owner1", db);
    expect(count).toBe(2);
  });

  it("counts pending conformity proposals without time filter", () => {
    insertConformityProposal("owner1", "pending");
    insertConformityProposal("owner1", "pending");

    const count = getUnreadCount("owner1", db);
    expect(count).toBe(2);
  });

  it("counts pending soul proposals without time filter", () => {
    insertSoulProposal("sp1", "owner1", "pending");

    const count = getUnreadCount("owner1", db);
    expect(count).toBe(1);
  });

  it("counts pending non-expired episodic proposals without time filter", () => {
    insertEpisodicProposal("ep1", "owner1", "pending", isoAhead(10));
    insertEpisodicProposal("ep2", "owner1", "pending", isoAgo(1)); // expired

    const count = getUnreadCount("owner1", db);
    expect(count).toBe(1);
  });

  it("uses lastFeedViewedAt when it is more recent than windowFloor", () => {
    insertConnector("c1", "owner1");
    // 3 syncs: one old (6 days), two recent (1 day, 2 days)
    const sixDaysAgo = isoAgo(6);
    insertSyncLog("sl-old", "c1", "success", isoAgo(6, 1000));
    insertSyncLog("sl-new1", "c1", "success", isoAgo(1));
    insertSyncLog("sl-new2", "c1", "success", isoAgo(2));

    // Owner viewed feed 4 days ago — so syncs before 4 days ago are "read"
    const fourDaysAgo = isoAgo(4);
    insertProfile("owner1", fourDaysAgo);

    const count = getUnreadCount("owner1", db);
    // Only sl-new1 and sl-new2 are newer than 4 days ago
    expect(count).toBe(2);
  });

  it("sums all source counts correctly", () => {
    insertConnector("c1", "owner1");
    insertSyncLog("sl1", "c1", "success", isoAgo(1));
    insertConformityProposal("owner1", "pending");
    insertSoulProposal("sp1", "owner1", "pending");
    insertEpisodicProposal("ep1", "owner1", "pending", isoAhead(10));

    const count = getUnreadCount("owner1", db);
    expect(count).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// markFeedViewed
// ---------------------------------------------------------------------------

describe("markFeedViewed", () => {
  it("updates lastFeedViewedAt on existing profile", () => {
    insertProfile("owner1", null);
    const before = new Date().toISOString();

    markFeedViewed("owner1", db);

    const row = testSqlite
      .prepare("SELECT last_feed_viewed_at FROM profiles WHERE id = ?")
      .get("owner1") as { last_feed_viewed_at: string };

    expect(row.last_feed_viewed_at).toBeDefined();
    expect(row.last_feed_viewed_at >= before).toBe(true);
  });

  it("creates the profile row when it does not exist (single-user mode)", () => {
    markFeedViewed("anon-owner", db);

    const row = testSqlite
      .prepare("SELECT last_feed_viewed_at FROM profiles WHERE id = ?")
      .get("anon-owner") as { last_feed_viewed_at: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.last_feed_viewed_at).toBeDefined();
  });

  it("after markFeedViewed, unread count for pending-only items still counts pending", () => {
    insertProfile("owner1", null);
    insertConformityProposal("owner1", "pending");

    markFeedViewed("owner1", db);

    // Pending items are always unread regardless of lastFeedViewedAt
    const count = getUnreadCount("owner1", db);
    expect(count).toBe(1);
  });

  it("after markFeedViewed, connector syncs created before view are not counted", () => {
    insertConnector("c1", "owner1");
    const oldSync = isoAgo(1);
    insertSyncLog("sl1", "c1", "success", oldSync);
    insertProfile("owner1", null);

    // Simulate marking viewed now (after the sync)
    markFeedViewed("owner1", db);

    // No new syncs since lastFeedViewedAt — so sync count should be 0
    const count = getUnreadCount("owner1", db);
    // lastFeedViewedAt is now ≥ the sync createdAt, so sync is "read"
    const syncCountRow = testSqlite
      .prepare(
        `SELECT COUNT(*) AS cnt FROM sync_log sl
         JOIN connectors c ON sl.connector_id = c.id
         WHERE c.owner_key = ? AND sl.created_at >= ?`,
      )
      .get(
        "owner1",
        (testSqlite.prepare("SELECT last_feed_viewed_at FROM profiles WHERE id = ?").get("owner1") as { last_feed_viewed_at: string }).last_feed_viewed_at,
      ) as { cnt: number };
    expect(syncCountRow.cnt).toBe(0);
  });
});
