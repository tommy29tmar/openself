import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { sqlite } from "@/lib/db";
import { page } from "@/lib/db/schema";
import {
  type PageConfig,
  validatePageConfig,
} from "@/lib/page-config/schema";

const RESERVED_USERNAMES = new Set(["draft", "api", "builder", "admin", "invite", "_next"]);

/**
 * Read the draft row — used by preview and agent tools.
 * Draft id = sessionId (e.g. '__default__' in single-user mode).
 */
export function getDraft(sessionId: string = "__default__"): { config: PageConfig; username: string; status: string } | null {
  const row = db
    .select()
    .from(page)
    .where(
      and(
        eq(page.id, sessionId),
        inArray(page.status, ["draft", "approval_pending"]),
      ),
    )
    .get();

  if (!row) return null;

  return {
    config: row.config as PageConfig,
    username: row.username,
    status: row.status,
  };
}

/**
 * Read the published page for a username — used by public route.
 */
export function getPublishedPage(username: string): PageConfig | null {
  const row = db
    .select()
    .from(page)
    .where(and(eq(page.username, username), eq(page.status, "published")))
    .get();

  if (!row) return null;

  return row.config as PageConfig;
}

/**
 * True when at least one page row exists for a session (draft or published).
 */
export function hasAnyPage(sessionId: string = "__default__"): boolean {
  const row = db
    .select({ id: page.id })
    .from(page)
    .where(eq(page.sessionId, sessionId))
    .limit(1)
    .get();
  return Boolean(row);
}

/**
 * Write/update the draft row. Used by generate_page, set_theme, reorder, update_page_config.
 * Draft id = sessionId.
 */
export function upsertDraft(username: string, config: PageConfig, sessionId: string = "__default__"): void {
  const result = validatePageConfig(config);
  if (!result.ok) {
    throw new Error(`Invalid PageConfig: ${result.errors.join("; ")}`);
  }

  db.insert(page)
    .values({
      id: sessionId,
      sessionId,
      username,
      config,
      status: "draft",
    })
    .onConflictDoUpdate({
      target: page.id,
      set: {
        username,
        config,
        status: "draft",
        updatedAt: new Date().toISOString(),
      },
    })
    .run();
}

/**
 * Mark draft as approval_pending — called by agent tool request_publish.
 */
export function requestPublish(username: string, sessionId: string = "__default__"): void {
  if (RESERVED_USERNAMES.has(username)) {
    throw new Error(`Username "${username}" is reserved`);
  }

  const draft = db
    .select()
    .from(page)
    .where(eq(page.id, sessionId))
    .get();

  if (!draft) {
    throw new Error("No draft page exists");
  }

  db.update(page)
    .set({
      username,
      status: "approval_pending",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(page.id, sessionId))
    .run();
}

/**
 * Promote draft → published. Called by POST /api/publish (user action).
 * Atomic: reads draft, creates/updates published row, resets draft status.
 */
export function confirmPublish(username: string, sessionId: string = "__default__"): void {
  // Guard 1: reserved usernames
  if (RESERVED_USERNAMES.has(username)) {
    throw new Error(`Username "${username}" is reserved`);
  }

  const txn = sqlite.transaction(() => {
    // Guard 2: draft must be in approval_pending
    const draftRow = sqlite
      .prepare("SELECT * FROM page WHERE id = ?")
      .get(sessionId) as any;

    if (!draftRow || draftRow.status !== "approval_pending") {
      throw new Error("No page pending approval");
    }

    // Step 1: de-publish any previously published page with a different username,
    // scoped to this session only.
    sqlite
      .prepare("DELETE FROM page WHERE status = 'published' AND session_id = ? AND username != ?")
      .run(sessionId, username);

    // Step 2: upsert published row (id=username, status="published", config from draft)
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO page (id, session_id, username, config, status, generated_at, updated_at)
         VALUES (?, ?, ?, ?, 'published', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           username = excluded.username,
           config = excluded.config,
           status = 'published',
           generated_at = excluded.generated_at,
           updated_at = excluded.updated_at`,
      )
      .run(username, sessionId, username, draftRow.config, draftRow.generated_at, now);

    // Step 3: reset draft status back to "draft"
    sqlite
      .prepare("UPDATE page SET status = 'draft', updated_at = ? WHERE id = ?")
      .run(now, sessionId);
  });

  txn();
}
