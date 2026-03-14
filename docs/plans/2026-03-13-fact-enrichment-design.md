# Fact Enrichment Layer — Design Document

**Date**: 2026-03-13
**Status**: Approved
**Challenge**: Multi-model (Gemini + Claude × 2, 2 rounds)

## Problem

When the same real-world entity is created from different sources (chat, LinkedIn, GitHub, Spotify, Strava, RSS), it produces duplicate facts on the user's page because different sources generate different keys for the same entity. There is NO semantic matching — dedup is purely key-based.

Example:
- User chats: "I studied at Politecnico di Milano" → `education/politecnico-milano`
- LinkedIn import: same institution → `education/li-edu-politecnico-di-milano-0`
- Result: two separate entries on the page

**User's vision**: Information should never duplicate — it should enrich. Transparently. The user should be "pleasantly surprised".

## Design Principle

**Cluster, don't merge.** Facts are never physically mutated. Instead, related facts from different sources are grouped into clusters, and a read-time projection resolves the "enriched" view using source priority.

This emerged from multi-model adversarial review. The original physical-merge approach was rejected for:
- Data destruction (irreversible field-level merge)
- FK breakage (fact_display_overrides, parentFactId, episodic events)
- Purge incompatibility (can't disconnect LinkedIn if facts are merged)
- Immutability contract violation (facts are immutable by design)
- Race conditions (DELETE + INSERT without transaction wrapping)
- Sort order / visibility loss

## Architecture

```
WRITE PATH (immutable, fast)
┌──────────────────────────────────────────────────────┐
│ createFact()                                          │
│  1. Normal insert (existing behavior, untouched)      │
│  2. tryAssignCluster() — NEW, post-insert             │
│     exact slug match only, single indexed query        │
│     assigns cluster_id if obvious match found          │
│     if no match → fact stays unclustered (normal)      │
└──────────────────────────────────────────────────────┘

ASYNC PATH (worker, post-sync + weekly deep heartbeat)
┌──────────────────────────────────────────────────────┐
│ consolidate_facts job                                 │
│  1. Query unclustered facts by category               │
│  2. Deterministic pass: slug-based grouping            │
│  3. LLM pass (fast tier): near-duplicate detection     │
│  4. Assign/create cluster_ids                          │
│  5. Never mutate fact values                           │
└──────────────────────────────────────────────────────┘

READ PATH (projection)
┌──────────────────────────────────────────────────────┐
│ projectClusteredFacts()                               │
│  1. Load facts + cluster memberships                  │
│  2. For each cluster: project to single virtual fact   │
│     using source priority chain                        │
│  3. Unclustered facts pass through as-is              │
│  4. Used by: page composer, agent context, preview     │
└──────────────────────────────────────────────────────┘
```

## Data Model

### New table: `fact_clusters`

```sql
CREATE TABLE fact_clusters (
  id TEXT PRIMARY KEY,
  ownerKey TEXT NOT NULL,
  category TEXT NOT NULL,
  canonicalKey TEXT,              -- "best" key for display (agent-generated preferred over connector-prefixed)
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fact_clusters_owner ON fact_clusters(ownerKey);
CREATE INDEX idx_fact_clusters_owner_category ON fact_clusters(ownerKey, category);
```

### New column on `facts` table

```sql
ALTER TABLE facts ADD COLUMN cluster_id TEXT REFERENCES fact_clusters(id);
CREATE INDEX idx_facts_cluster ON facts(cluster_id) WHERE cluster_id IS NOT NULL;
```

## Sync Clustering (Phase 1 — at write time)

### Identity Matchers

Category-specific functions that extract a "slug identity" from a fact value:

| Category | Identity Fields | Match Logic |
|----------|----------------|-------------|
| education | institution + degree | Both must match (slug) |
| experience/position | company + role | Company must match (slug), role fuzzy (optional) |
| skill | name | Exact slug match |
| language | language or name | Exact slug match |
| social | platform | Exact slug match |
| music | title + artist | Both must match (slug) |
| activity | name or type | Either matches (slug) |
| project | name or url | Name slug match OR exact URL match |
| contact | type + value | Both must match (exact) |
| achievement | title | Slug match |
| reading | title + author | Both must match (slug) |
| stat | label | Slug match |
| identity | — | Skip (unique semantics per key) |

### `tryAssignCluster()` Logic

```
After successful createFact():
1. Get identity slug for new fact (category-specific)
2. If identity is null (e.g., identity category) → return, no clustering
3. Query existing facts in same (ownerKey, category) that are NOT this fact
4. For each existing fact:
   a. Compute identity slug
   b. If exact match → found candidate
5. If candidate found:
   a. If candidate has cluster_id → assign same cluster_id to new fact
   b. If candidate has no cluster_id → create new cluster, assign to both
6. Update cluster canonicalKey: prefer non-connector-prefixed key
```

**Performance**: Single indexed query per fact. For bulk imports, can batch-preload category facts once.

### Slug Normalization

```typescript
function slugify(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // remove accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")  // remove special chars
    .replace(/\s+/g, "-");         // spaces → hyphens
}
```

## Async Clustering (Phase 2 — worker job)

### Job type: `consolidate_facts`

**Triggers:**
1. After every connector sync completion (enqueued by sync handlers)
2. In deep heartbeat (weekly, alongside curate_page and consolidate_episodes)

**Idempotency**: Daily guard via `computeOwnerDay()` for heartbeat path. Post-sync path: runs once per sync (no guard needed — sync is already guarded).

### Algorithm

```
For each category with >1 unclustered fact:
  1. Deterministic pass: group by identity slug
     → creates clusters for matches the sync phase missed
  2. LLM pass (fast tier): for remaining unclustered facts
     → prompt: "identify facts referring to the same real-world entity"
     → returns: pairs with confidence score
  3. For confidence ≥ 0.8: auto-cluster
  4. For confidence 0.6–0.8: log for review (future: agent situation)
  5. Never merge values. Only assign cluster_ids.
```

**Budget**: Fast tier, one call per category with >1 unclustered fact. Typical: 5-8 calls per owner per run.

### LLM Prompt

```
Given these facts in category "{category}", identify pairs that refer to the same real-world entity.
Each fact has a key, value (JSON), and source.

{facts as JSON array}

For each duplicate pair, respond:
- key_a, key_b
- confidence (0.0-1.0)
- reasoning (one sentence)

Rules:
- Same institution but different degrees = NOT duplicates
- Same company but different roles with different time periods = NOT duplicates
- Only report pairs with confidence ≥ 0.6
```

## Read-Time Projection

### Source Priority Chain

```
user_edit (curate_content tool, source="user") > chat (source="chat") > connector (source="connector")
```

### `projectClusteredFacts()` Function

```typescript
function projectClusteredFacts(facts: FactRow[], clusters: ClusterRow[]): ProjectedFact[] {
  const clusterMap = groupBy(facts.filter(f => f.clusterId), f => f.clusterId);
  const unclustered = facts.filter(f => !f.clusterId);

  const projected: ProjectedFact[] = [];

  // Unclustered facts pass through as-is
  for (const fact of unclustered) {
    projected.push({ ...fact, sources: [fact.source], clusterSize: 1 });
  }

  // Clustered facts → project to single virtual fact per cluster
  for (const [clusterId, clusterFacts] of clusterMap) {
    const cluster = clusters.find(c => c.id === clusterId);
    const sorted = clusterFacts.sort((a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]);

    // Per-field resolution: highest-priority source with non-empty value wins
    const mergedValue: Record<string, unknown> = {};
    for (const fact of sorted) {
      const val = typeof fact.value === "object" ? fact.value : {};
      for (const [field, value] of Object.entries(val)) {
        if (mergedValue[field] === undefined || mergedValue[field] === null || mergedValue[field] === "") {
          mergedValue[field] = value;
        }
      }
    }

    projected.push({
      id: sorted[0].id,              // use highest-priority fact's ID
      category: cluster.category,
      key: cluster.canonicalKey ?? sorted[0].key,
      value: mergedValue,
      source: sorted[0].source,       // primary source
      sources: clusterFacts.map(f => f.source),
      clusterId,
      clusterSize: clusterFacts.length,
      visibility: resolveClusterVisibility(clusterFacts),
      sortOrder: sorted[0].sortOrder,
      // ... other fields from highest-priority fact
    });
  }

  return projected.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
```

### Integration Points

1. **Page composer** (`page-composer.ts`): Replace `getActiveFacts()` with `getProjectedFacts()` (projected view)
2. **Agent context** (`context.ts`): Facts block shows projected view, annotated with source count
3. **Preview** (`/api/preview`): Uses projected view via `projectCanonicalConfig()`
4. **Publish pipeline**: Uses projected view
5. **Agent tools**: `create_fact` response includes cluster info when applicable

### Visibility Resolution

For clustered facts: use the most permissive visibility among cluster members, UNLESS any member is explicitly `private` (user override always wins).

```
private (any member) → private
public (any member, none private) → public
proposed (all members) → proposed
```

## Agent Awareness

### create_fact tool response (when clustered)

```json
{
  "success": true,
  "factId": "new-fact-uuid",
  "clustered": true,
  "clusterSize": 2,
  "enrichedView": {
    "institution": "Politecnico di Milano",
    "degree": "Laurea",
    "field": "Informatica",
    "startDate": "2015",
    "endDate": "2018"
  },
  "newFieldsFromCluster": ["startDate", "endDate"],
  "message": "Clustered with existing LinkedIn data. Education now includes dates."
}
```

### batch_facts tool

Same enrichment metadata per-operation in the results array.

### batchCreateFacts (connector import)

`ImportReport` gains:
- `factsClustered: number` — count of facts assigned to existing clusters
- Logged as `fact_clustered` event per enrichment

## Connector Disconnect + Purge

**No changes needed to purge logic.** `purgeConnectorData()` already hard-deletes connector facts via `connector_items` joins. When connector facts are deleted:
- Their cluster membership is gone (cluster_id was on the deleted fact row)
- Projection automatically adjusts — cluster now shows only remaining (chat) facts
- If cluster has only one fact left, it still works (single-fact cluster = same as unclustered)
- Empty clusters (all facts deleted) cleaned up in global housekeeping

## Migration

Single migration adding:
1. `fact_clusters` table
2. `cluster_id` column on `facts`
3. Indexes

No data migration needed — all existing facts start unclustered. Clustering happens organically via sync and async paths.

## Testing Strategy

1. **Unit tests**: Identity matchers (per category), slug normalization, projection logic, visibility resolution
2. **Integration tests**: createFact + tryAssignCluster flow, batchCreateFacts clustering, purge with clusters
3. **Worker tests**: consolidate_facts job, LLM clustering mock
4. **E2E scenario**: Chat education → LinkedIn import → verify single enriched entry on page

## Open Decisions

1. **Materialized projection cache**: Start without it (projection is cheap for typical fact counts <200). Add if performance becomes an issue.
2. **Cluster split**: If LLM later decides two facts in a cluster are NOT the same entity, update cluster_ids. No data loss.
3. **Agent situation for ambiguous clusters**: Future enhancement — `has_ambiguous_clusters` situation for agent-driven resolution of 0.6–0.8 confidence cases.
