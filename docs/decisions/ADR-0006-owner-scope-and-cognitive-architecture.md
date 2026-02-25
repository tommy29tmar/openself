# ADR-0006: Owner Scope and Cognitive Architecture

Status: Accepted
Date: 2026-02-25
Deciders: engineering

## Context

Phase 1a introduces multi-session identity, 3-tier memory, soul profiles, and a worker process. All cognitive data (memories, soul, summaries, heartbeat runs, trust ledger, conflicts) must be scoped per user without cross-contamination. Existing tables (facts, page, messages) use `session_id` as their primary key, but a user can have multiple sessions across devices and auth flows.

Key challenges:
1. A user's facts created in session A must be accessible from session B
2. New cognitive tables (memory, soul) need a stable owner key that isn't session-specific
3. The draft page must be accessible from any session, not just the one that created it
4. Message quota must be per-user, not per-session (to prevent bypass)
5. Web and worker processes must coordinate schema migrations without contention

## Decision

### OwnerScope — per-request identity envelope

Every API request resolves an `OwnerScope` with four keys:

```ts
type OwnerScope = {
  cognitiveOwnerKey: string;   // Stable key for NEW tables (memory, soul, summaries, etc.)
  knowledgeReadKeys: string[]; // All session IDs for reading EXISTING tables (facts, page, messages)
  knowledgePrimaryKey: string; // Stable write key for EXISTING tables (anchor session)
  currentSessionId: string;    // Current request's session (message writes, quota)
};
```

- **Authenticated users**: `cognitiveOwnerKey = profileId`, `knowledgeReadKeys = allSessionIdsForProfile(profileId) ∪ {currentSessionId}`, `knowledgePrimaryKey = anchorSessionId(profileId)` (oldest session linked to profile)
- **Anonymous users**: all keys = `sessionId`

### Anchor session

The `knowledgePrimaryKey` is the FIRST (oldest) session linked to a profile. This is the stable key for all writes to existing tables (facts, page). Existing tables use `sessionId` as PK/FK — switching to `profileId` would require data migration. The anchor is a real session ID that existing code accepts.

### Session-profile backfill

Auth flows (register, login, OAuth) backfill `profileId` on the old invite session so it appears in `allSessionIdsForProfile()`. `knowledgeReadKeys` always includes `currentSessionId` as safety net.

### Message quota

Dual source of truth by user type (no overlap):
- Anonymous: `sessions.message_count` (existing, 50/session)
- Authenticated: `profile_message_usage` table (new, atomic counter, 200/profile)

### Migration bootstrap

`DB_BOOTSTRAP_MODE` env var (`leader` | `follower` | `off`):
- Web (leader): runs migrations synchronously on startup, writes version to `schema_meta`
- Worker (follower): async `awaitSchema()` polls `schema_meta` until ready
- Default: `leader` (local dev single-process works unchanged)

### Trust ledger

Every cognitive mutation (memory saved, soul accepted, conflict resolved) is logged with an `undo_payload` at write time. Reversal uses transactional CAS (validate → claim → execute undo in single transaction). If undo throws, transaction rolls back.

### Soul profiles

Versioned overlays with unique active constraint. Proposals require user approval (48h TTL). Compiled into prose for system prompt injection.

### Fact conflicts

Detected contradictions tracked in dedicated `fact_conflicts` table. Source precedence (user_explicit > chat > connector > heartbeat) auto-skips when gap >= 2. Three resolution paths: agent tool, user API, auto-expire (7 days).

## Consequences

**Positive:**
- No cross-user contamination (all cognitive data scoped by `cognitiveOwnerKey`)
- No cross-session fragmentation (anchor session as stable write key)
- No history loss (messages always session-keyed, read via union of all session IDs)
- Worker-safe (leader/follower bootstrap, no migration race)
- Auditable (trust ledger with reversible actions)

**Negative:**
- Two key systems (session-based for legacy tables, profile-based for new tables) add complexity
- Anchor session concept requires backfill logic in all auth flows
- Worker requires separate deployment as a second service

## Alternatives Considered

1. **Use profileId as write key for all tables**: Would require data migration + constraint changes on existing tables. Too risky for Phase 1a.
2. **Single session per user**: Would lose multi-device support and break the invite-then-register flow.
3. **No worker process**: Would require running heartbeat/summary jobs in request handlers, adding latency.
4. **In-memory cooldown for memory writes**: Would reset on server restart, allowing burst writes after deploy.
