/**
 * One-time backfill: retroactively cluster unclustered facts.
 *
 * Run with: npx tsx src/scripts/backfill-clusters.ts
 *
 * Follows the same pattern as src/lib/worker/handlers/consolidate-facts.ts
 * but runs as a standalone one-shot script.
 * Safe to run multiple times (idempotent).
 */
import { tryAssignCluster } from "@/lib/services/fact-cluster-service";
import { sqlite } from "@/lib/db";

// Get all active unclustered facts, grouped by profile for scope resolution
const unclustered = sqlite
  .prepare(
    `SELECT id, session_id, profile_id, category, key, value, source
     FROM facts
     WHERE archived_at IS NULL AND cluster_id IS NULL
     ORDER BY profile_id, category, created_at`
  )
  .all() as Array<{
    id: string;
    session_id: string | null;
    profile_id: string | null;
    category: string;
    key: string;
    value: string;
    source: string;
  }>;

console.log(`Found ${unclustered.length} unclustered facts`);

let clustered = 0;
let skipped = 0;
for (const fact of unclustered) {
  // Skip facts without valid owner or session (cannot cluster)
  if (!fact.profile_id || !fact.session_id) {
    skipped++;
    continue;
  }

  try {
    // Parse value from JSON string to object (SQLite stores as text)
    let parsedValue: Record<string, unknown>;
    try {
      parsedValue = typeof fact.value === "string" ? JSON.parse(fact.value) : {};
    } catch {
      parsedValue = {};
    }

    // Get all session IDs for this profile (cross-session clustering)
    const sessionIds = (
      sqlite
        .prepare("SELECT id FROM sessions WHERE profile_id = ?")
        .all(fact.profile_id) as Array<{ id: string }>
    ).map((r) => r.id);

    const result = tryAssignCluster({
      factId: fact.id,
      factKey: fact.key,
      category: fact.category,
      value: parsedValue,
      source: fact.source,
      ownerKey: fact.profile_id,
      sessionId: fact.session_id,
      sessionIds: sessionIds.length > 0 ? sessionIds : undefined,
    });
    if (result?.clusterId) {
      clustered++;
      console.log(`  Clustered: ${fact.category}/${fact.key} → ${result.clusterId}`);
    }
  } catch (err) {
    console.warn(`  Failed: ${fact.category}/${fact.key}: ${err}`);
  }
}

console.log(`\nDone: ${clustered} clustered, ${skipped} skipped, ${unclustered.length} total`);
