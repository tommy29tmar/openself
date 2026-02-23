import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { sqlite } from "@/lib/db";
import { page } from "@/lib/db/schema";
import {
  type PageConfig,
  validatePageConfig,
} from "@/lib/page-config/schema";

const RESERVED_USERNAMES = new Set(["draft", "api", "builder", "admin", "_next"]);

/**
 * Read the draft row (id="draft") — used by preview and agent tools.
 */
export function getDraft(): { config: PageConfig; username: string; status: string } | null {
  const row = db
    .select()
    .from(page)
    .where(eq(page.id, "draft"))
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
 * True when at least one page row exists (draft or published).
 */
export function hasAnyPage(): boolean {
  const row = db.select({ id: page.id }).from(page).limit(1).get();
  return Boolean(row);
}

/**
 * Write/update the draft row. Used by generate_page, set_theme, reorder, update_page_config.
 */
export function upsertDraft(username: string, config: PageConfig): void {
  const result = validatePageConfig(config);
  if (!result.ok) {
    throw new Error(`Invalid PageConfig: ${result.errors.join("; ")}`);
  }

  db.insert(page)
    .values({
      id: "draft",
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
export function requestPublish(username: string): void {
  if (RESERVED_USERNAMES.has(username)) {
    throw new Error(`Username "${username}" is reserved`);
  }

  const draft = db
    .select()
    .from(page)
    .where(eq(page.id, "draft"))
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
    .where(eq(page.id, "draft"))
    .run();
}

/**
 * Promote draft → published. Called by POST /api/publish (user action).
 * Atomic: reads draft, creates/updates published row, resets draft status.
 */
export function confirmPublish(username: string): void {
  // Guard 1: reserved usernames
  if (RESERVED_USERNAMES.has(username)) {
    throw new Error(`Username "${username}" is reserved`);
  }

  const txn = sqlite.transaction(() => {
    // Guard 2: draft must be in approval_pending
    const draftRow = sqlite
      .prepare("SELECT * FROM page WHERE id = 'draft'")
      .get() as any;

    if (!draftRow || draftRow.status !== "approval_pending") {
      throw new Error("No page pending approval");
    }

    // Step 1: de-publish any previously published page with a different username.
    // Prevents orphan pages when user changes username.
    // NOTE: This assumes single-identity model (one user = one DB file).
    // In a future multi-user model, this DELETE must be scoped to the current user's rows.
    sqlite
      .prepare("DELETE FROM page WHERE status = 'published' AND username != ?")
      .run(username);

    // Step 2: upsert published row (id=username, status="published", config from draft)
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO page (id, username, config, status, generated_at, updated_at)
         VALUES (?, ?, ?, 'published', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           username = excluded.username,
           config = excluded.config,
           status = 'published',
           generated_at = excluded.generated_at,
           updated_at = excluded.updated_at`,
      )
      .run(username, username, draftRow.config, draftRow.generated_at, now);

    // Step 3: reset draft status back to "draft"
    sqlite
      .prepare("UPDATE page SET status = 'draft', updated_at = ? WHERE id = 'draft'")
      .run(now);
  });

  txn();
}
