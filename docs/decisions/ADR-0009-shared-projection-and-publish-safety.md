# ADR-0009: Shared Canonical Projection and Publish Safety

Status: Accepted
Date: 2026-02-26
Deciders: engineering

## Context

Multiple code paths (preview, SSE stream, publish) independently composed page configs
from facts, each with slightly different filtering logic. This created three risks:

1. **Privacy leak**: Legacy `draft.config` rows could contain private facts baked in by
   earlier code. Routes serving `draft.config` directly exposed this data.
2. **Hash inconsistency**: Preview and publish computed hashes differently, making the
   concurrency guard (`expectedHash`) unreliable.
3. **Promote-without-consent**: The publish pipeline could promote facts to `public`
   without the user seeing the latest preview (stale preview → publish = silent consent
   to facts the user hasn't reviewed).

## Decision

1. **Single projection function**: `projectPublishableConfig()` in `page-projection.ts`
   is the only way to produce a page config for preview or publish. It filters facts
   through `filterPublishableFacts()` (visibility + sensitive category check), composes
   via the deterministic skeleton, and preserves draft metadata (theme, style, section
   order) without carrying over legacy section content.

2. **Shared publishable filter**: `filterPublishableFacts()` is used by both the
   projection function and the publish promote loop. This prevents a class of bugs
   where a fact passes projection but fails promotion (or vice versa).

3. **Hash guard**: The frontend stores `configHash` from the latest preview response
   and sends it as `expectedHash` in the publish request. The pipeline recomputes the
   canonical hash and rejects with `STALE_PREVIEW_HASH` (409) if they don't match.
   Zero side-effects on mismatch (no visibility promotions, no DB writes).

4. **Promote-all model**: On publish, all `proposed` facts are promoted to `public`
   atomically in a single SQLite transaction. The user's click on "Publish" is explicit
   consent for all proposed facts visible in the preview.

5. **No raw draft serving**: Neither `/api/preview` nor `/api/preview/stream` serve
   `draft.config` directly. Both call `projectPublishableConfig()`.

## Consequences

**Positive:**
- Privacy-by-architecture: private facts cannot enter page config regardless of legacy data
- Hash consistency: preview and publish always agree on what the canonical config is
- Concurrency safety: stale publishes are rejected before any side-effects
- Auditability: every visibility promotion is logged

**Negative:**
- Preview is slightly more expensive (recomposes from facts every poll/SSE tick instead
  of reading cached draft.config). Mitigated by the deterministic composer being fast
  (~1-5ms for typical fact counts).
- The `expectedHash` flow requires frontend changes (storing and sending the hash).
  Without the frontend sending the hash, the guard is inoperative (backward-compatible).

## Alternatives Considered

1. **Sanitize draft.config on write**: Every `upsertDraft` call would filter private
   facts before persisting. Rejected because it doesn't protect against legacy data
   already in the DB, and it scatters the filtering logic across multiple write sites.

2. **Separate projection for preview vs publish**: Keep two code paths but ensure
   they use the same filter. Rejected because code duplication leads to drift over time,
   and the current single-function approach is simpler.

3. **Optimistic concurrency via draft.updatedAt**: Use a timestamp-based guard instead
   of content hash. Rejected because timestamps don't detect fact-level changes that
   don't touch the draft row (e.g., visibility toggle on a fact).
