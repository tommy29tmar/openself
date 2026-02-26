import { eq, and, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { sqlite } from "@/lib/db";
import { page } from "@/lib/db/schema";
import {
  type PageConfig,
  validatePageConfig,
} from "@/lib/page-config/schema";
import { normalizeConfigForWrite } from "@/lib/page-config/normalize";
import { PublishError } from "@/lib/services/errors";
import { RESERVED_USERNAMES } from "@/lib/page-config/usernames";

/** Compute SHA-256 hex digest of a PageConfig JSON. */
export function computeConfigHash(config: PageConfig): string {
  return createHash("sha256")
    .update(JSON.stringify(config))
    .digest("hex");
}

/**
 * Read the draft row — used by preview and agent tools.
 * Draft id = sessionId (e.g. '__default__' in single-user mode).
 */
export type DraftResult = {
  config: PageConfig;
  username: string;
  status: string;
  configHash: string | null;
  updatedAt: string | null;
};

export function getDraft(sessionId: string = "__default__"): DraftResult | null {
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
    configHash: row.configHash,
    updatedAt: row.updatedAt ?? null,
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
 * Check if any published page exists across multiple session IDs.
 * Used by mode detection (steady_state vs onboarding).
 */
export function hasAnyPublishedPage(sessionIds: string[]): boolean {
  if (sessionIds.length === 0) return false;
  const row = db
    .select({ id: page.id })
    .from(page)
    .where(
      and(
        inArray(page.sessionId, sessionIds),
        eq(page.status, "published"),
      ),
    )
    .limit(1)
    .get();
  return Boolean(row);
}

/**
 * Write/update the draft row. Used by generate_page, set_theme, reorder, update_page_config.
 * Draft id = sessionId.
 */
export function upsertDraft(username: string, config: PageConfig, sessionId: string = "__default__", profileId?: string): void {
  const normalized = normalizeConfigForWrite(config);
  const result = validatePageConfig(normalized);
  if (!result.ok) {
    throw new Error(`Invalid PageConfig: ${result.errors.join("; ")}`);
  }

  const hash = computeConfigHash(normalized);
  // Use normalized config from here on
  config = normalized;
  const effectiveProfileId = profileId ?? sessionId;

  db.insert(page)
    .values({
      id: sessionId,
      sessionId,
      profileId: effectiveProfileId,
      username,
      config,
      configHash: hash,
      status: "draft",
    })
    .onConflictDoUpdate({
      target: page.id,
      set: {
        username,
        config,
        configHash: hash,
        profileId: effectiveProfileId,
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
    throw new PublishError(`Username "${username}" is reserved`, "USERNAME_RESERVED", 400);
  }

  const txn = sqlite.transaction(() => {
    // Guard 2: draft must be in approval_pending
    const draftRow = sqlite
      .prepare("SELECT * FROM page WHERE id = ?")
      .get(sessionId) as any;

    if (!draftRow || draftRow.status !== "approval_pending") {
      throw new Error("No page pending approval");
    }

    // Guard 3: ownership — reject if username is already published by another profile/session
    const profileId = draftRow.profile_id ?? draftRow.session_id;
    const existingPublished = sqlite
      .prepare("SELECT session_id, profile_id FROM page WHERE id = ? AND status = 'published'")
      .get(username) as { session_id: string; profile_id: string | null } | undefined;

    if (existingPublished) {
      const existingProfile = existingPublished.profile_id ?? existingPublished.session_id;
      if (existingProfile !== profileId) {
        throw new PublishError("Username already claimed by another user", "USERNAME_TAKEN", 409);
      }
    }

    // Step 1: de-publish any previously published page with a different username,
    // scoped to this profile (fallback: session).
    sqlite
      .prepare(
        "DELETE FROM page WHERE status = 'published' AND (profile_id = ? OR session_id = ?) AND username != ?",
      )
      .run(profileId, sessionId, username);

    // Step 2: upsert published row (id=username, status="published", config from draft)
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO page (id, session_id, profile_id, username, config, config_hash, status, generated_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           username = excluded.username,
           config = excluded.config,
           config_hash = excluded.config_hash,
           status = 'published',
           generated_at = excluded.generated_at,
           updated_at = excluded.updated_at`,
      )
      .run(username, sessionId, profileId, username, draftRow.config, draftRow.config_hash, draftRow.generated_at, now);

    // Step 3: reset draft status back to "draft"
    sqlite
      .prepare("UPDATE page SET status = 'draft', updated_at = ? WHERE id = ?")
      .run(now, sessionId);
  });

  txn();
}
