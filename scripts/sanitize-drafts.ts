#!/usr/bin/env npx tsx
/**
 * One-shot draft sanitization script.
 *
 * Recomposes all draft configs from facts using `projectPublishableConfig()`.
 * This ensures no private facts are baked into draft.config from legacy writes.
 *
 * Modes:
 *   --dry-run   (default) Show what would change, no DB writes
 *   --export    Write diffs to sanitize-report.json
 *   --apply     Actually update the DB
 *
 * Owner-scoped: iterates all draft rows, recomposes each from its sessionId's facts.
 * Idempotent: running twice produces the same result.
 */

import { db, sqlite } from "../src/lib/db/index";
import { page } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAllFacts } from "../src/lib/services/kb-service";
import { getPreferences } from "../src/lib/services/preferences-service";
import {
  projectPublishableConfig,
  type DraftMeta,
} from "../src/lib/services/page-projection";
import { computeConfigHash } from "../src/lib/services/page-service";
import { normalizeConfigForWrite } from "../src/lib/page-config/normalize";
import type { PageConfig } from "../src/lib/page-config/schema";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const mode = args.includes("--apply")
  ? "apply"
  : args.includes("--export")
    ? "export"
    : "dry-run";

console.log(`[sanitize-drafts] Mode: ${mode}\n`);

type DiffEntry = {
  draftId: string;
  sessionId: string;
  username: string;
  hashBefore: string;
  hashAfter: string;
  changed: boolean;
};

const diffs: DiffEntry[] = [];

// Get all draft rows
const drafts = db
  .select()
  .from(page)
  .where(eq(page.status, "draft"))
  .all();

console.log(`Found ${drafts.length} draft row(s)\n`);

for (const draft of drafts) {
  const sessionId = draft.sessionId;
  const draftConfig = draft.config as PageConfig;
  const hashBefore = draft.configHash ?? computeConfigHash(draftConfig);

  // Load facts for this session
  const facts = getAllFacts(sessionId);
  if (facts.length === 0) {
    console.log(`  [${draft.id}] (${draft.username}) — 0 facts, skipping`);
    continue;
  }

  // Get language preferences
  const { factLanguage, language } = getPreferences(sessionId);
  const factLang = factLanguage ?? language ?? "en";

  // Build draftMeta from existing draft (metadata only)
  const draftMeta: DraftMeta = {
    theme: draftConfig.theme,
    style: draftConfig.style,
    layoutTemplate: draftConfig.layoutTemplate,
    sections: draftConfig.sections,
  };

  // Recompose from facts
  const sanitized = normalizeConfigForWrite(
    projectPublishableConfig(facts, draft.username, factLang, draftMeta),
  );
  const hashAfter = computeConfigHash(sanitized);
  const changed = hashBefore !== hashAfter;

  diffs.push({
    draftId: draft.id,
    sessionId,
    username: draft.username,
    hashBefore,
    hashAfter,
    changed,
  });

  const tag = changed ? "CHANGED" : "unchanged";
  console.log(`  [${draft.id}] (${draft.username}) — ${facts.length} facts — ${tag}`);

  if (mode === "apply" && changed) {
    db.update(page)
      .set({
        config: sanitized,
        configHash: hashAfter,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(page.id, draft.id))
      .run();
    console.log(`    → Updated in DB`);
  }
}

console.log(`\n--- Summary ---`);
const changedCount = diffs.filter((d) => d.changed).length;
console.log(`Total drafts: ${diffs.length}`);
console.log(`Changed: ${changedCount}`);
console.log(`Unchanged: ${diffs.length - changedCount}`);

if (mode === "export") {
  const reportPath = "sanitize-report.json";
  writeFileSync(reportPath, JSON.stringify(diffs, null, 2));
  console.log(`\nReport written to ${reportPath}`);
}

if (mode === "dry-run" && changedCount > 0) {
  console.log(`\nRun with --apply to update the DB, or --export to save a report.`);
}
