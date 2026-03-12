# ADR-0016: Connector Dual-Write & Event Architecture

**Status:** Accepted
**Date:** 2026-03-12
**Deciders:** Engineering

## Context

With the introduction of RSS, Spotify, and Strava connectors (joining GitHub and LinkedIn),
connectors evolved beyond simple fact extraction. Users wanted their external activity
to appear in their timeline — but flooding the episodic event store with historical data
on first connection would create a poor experience.

Additionally, each connector has different dedup requirements, auth models, and failure
modes. A consistent architecture was needed to ensure all current and future connectors
behave predictably.

## Decision

### Dual-Output Pattern

Every connector produces two types of output:
1. **Facts (Tier 1)** — structured knowledge via `batchCreateFacts()` with `actor: "connector"`
2. **Episodic Events (Tier 4)** — timeline entries via `batchRecordEvents()` with source provenance

### First-Sync Baseline Rule

On a connector's **first sync** (`lastSync` is null):
- Facts are created normally
- **No episodic events are emitted**
- `connector_items` entries are seeded for dedup (so subsequent syncs detect truly new items)

This prevents timeline flooding with pre-existing data (e.g., 200 existing GitHub repos).

### Source Provenance

Each connector uses a fixed source string for episodic events:
- `'chat'` — user-reported via conversation
- `'github'` — GitHub connector
- `'linkedin_zip'` — LinkedIn ZIP import
- `'rss'` — RSS feed connector
- `'spotify'` — Spotify connector
- `'strava'` — Strava connector

The `external_id` column provides stable dedup keys per source.

### Event Infrastructure

`batchRecordEvents()` (`src/lib/connectors/connector-event-writer.ts`):
- Intra-batch dedup (same `externalId` within one batch)
- Chunked DB dedup queries (respects SQLite 999-parameter limit)
- Per-event error isolation (one failed insert doesn't block others)
- Atomic per-event writes with UNIQUE constraint handling

### Dream Cycle Isolation

`checkPatternThresholds()` filters to `source = 'chat'` only. Machine-imported events
(from any connector) never trigger habit/pattern proposals. This prevents false patterns
from automated data imports.

### Connector-Specific Rules

- **GitHub**: `hasActivityBaseline` guard prevents event emission on first sync;
  cursor seeded on initial sync
- **LinkedIn**: source unified to `'linkedin_zip'` (was inconsistently `'linkedin'`)
- **Spotify**: `staleSinceSync` counter tracks consecutive absent syncs; archives
  `sp-artist-*`/`sp-track-*`/`sp-genre-*` facts after 3 absent syncs
- **RSS**: SSRF-protected fetch (URL + DNS + redirect validation, 5MB streaming limit)
- **Strava**: Paginated fetch (max 20 pages/1000 activities), incremental via
  `syncCursor` unix timestamp

### Token Refresh

`withTokenRefresh()` is a generic wrapper for OAuth connectors that detects 401
responses, refreshes the token, and retries the original request once.

## Consequences

### Positive
- Consistent behavior across all connectors (current and future)
- Timeline integrity preserved (no first-sync flooding)
- Source provenance enables per-source filtering and caps
- Dream Cycle isolation prevents false pattern detection

### Negative
- All future connectors must implement both fact mapping AND event mapping
- `connector_items` table grows with every synced item (dedup tracking overhead)
- Per-connector rules (stale archival, first-sync guard) add implementation complexity

## Related

- ADR-0013 (Agent Memory Upgrade) — Tier 4 episodic memory design
- ADR-0015 (Memory Eviction & Scoring) — Tier 3 scoring that interacts with connector patterns
- `src/lib/connectors/connector-event-writer.ts` — shared event writer
- `src/lib/connectors/token-refresh.ts` — OAuth refresh wrapper
- `db/migrations/0029_memory_source_columns.sql` — source + external_id columns
