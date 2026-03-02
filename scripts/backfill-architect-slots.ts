#!/usr/bin/env npx tsx
/**
 * One-shot backfill for architect layout pages.
 *
 * Re-runs assignSlotsFromFacts with updated affinity-based registry
 * on all pages with layoutTemplate=architect.
 *
 * IMPORTANT: Passes draftSlots=undefined to bypass soft-pin, forcing
 * full affinity-based re-ranking on all non-locked sections.
 *
 * Modes:
 *   --dry-run   (default) Show what would change, no DB writes
 *   --apply     Actually update the DB
 *
 * Safety: skips pages with any user-locked sections.
 */

import { db, sqlite } from "../src/lib/db/index";
import { page } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { assignSlotsFromFacts } from "../src/lib/layout/assign-slots";
import { getLayoutTemplate } from "../src/lib/layout/registry";
import { normalizeConfigForWrite } from "../src/lib/page-config/normalize";
import { computeConfigHash } from "../src/lib/services/page-service";
import type { PageConfig, Section, SectionLock } from "../src/lib/page-config/schema";

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : "dry-run";

console.log(`[backfill-architect-slots] Mode: ${mode}\n`);

// config is already a parsed object (Drizzle mode: "json")
const allPages = db
  .select({ id: page.id, config: page.config, configHash: page.configHash, status: page.status })
  .from(page)
  .all();

const template = getLayoutTemplate("architect");

let totalPages = 0;
let changedPages = 0;
let skippedLocked = 0;

for (const row of allPages) {
  const config = row.config as PageConfig;
  if (!config?.layoutTemplate || config.layoutTemplate !== "architect") continue;
  if (!config.sections?.length) continue;

  totalPages++;

  // Check for user locks — skip entire page if any section has user lock
  const hasUserLock = config.sections.some(
    (s: Section) => s.lock?.lockedBy === "user"
  );
  if (hasUserLock) {
    console.log(`  SKIP ${row.id} — has user-locked sections`);
    skippedLocked++;
    continue;
  }

  // Build locks map (for composer locks that should be preserved)
  const locks = new Map<string, SectionLock>();
  for (const s of config.sections) {
    if (s.lock) locks.set(s.id, s.lock);
  }

  // draftSlots = undefined → bypasses soft-pin, forces full affinity re-ranking
  const { sections: newSections, issues } = assignSlotsFromFacts(
    template,
    config.sections,
    locks,
    undefined,
    undefined, // NO draftSlots — force re-assignment
  );

  // Compute diff
  const diffs: string[] = [];
  for (const ns of newSections) {
    const os = config.sections.find((s: Section) => s.id === ns.id);
    if (!os) continue;
    if (os.slot !== ns.slot || os.widgetId !== ns.widgetId) {
      diffs.push(
        `    ${ns.id} (${ns.type}): slot ${os.slot ?? "∅"} → ${ns.slot ?? "∅"}, widget ${os.widgetId ?? "∅"} → ${ns.widgetId ?? "∅"}`
      );
    }
  }

  if (diffs.length === 0) {
    console.log(`  OK ${row.id} — no changes`);
    continue;
  }

  changedPages++;
  console.log(`  CHANGED ${row.id} [${row.status}]:`);
  for (const d of diffs) console.log(d);
  if (issues.length > 0) {
    console.log(`    Issues: ${issues.map((i) => i.message).join("; ")}`);
  }

  if (mode === "apply") {
    const updated: PageConfig = { ...config, sections: newSections };
    const normalized = normalizeConfigForWrite(updated);
    const newHash = computeConfigHash(normalized);

    // Write config as object (Drizzle handles JSON serialization)
    // Include configHash + updatedAt per sanitize-drafts.ts pattern
    db.update(page)
      .set({
        config: normalized,
        configHash: newHash,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(page.id, row.id))
      .run();
    console.log(`    → Written (hash: ${row.configHash?.slice(0, 8)}… → ${newHash.slice(0, 8)}…)`);
  }
}

console.log(
  `\nDone. Pages scanned: ${totalPages}, changed: ${changedPages}, skipped (locked): ${skippedLocked}`
);

if (mode === "apply") {
  sqlite.pragma("wal_checkpoint(PASSIVE)");
  console.log("WAL checkpoint done.");
}
