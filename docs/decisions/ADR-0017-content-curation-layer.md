# ADR-0017: Content Curation Layer

## Status
Accepted — 2026-03-12

## Context
Users want polished, professional pages without being precise in chat. The agent extracts
facts from conversation (e.g., "openself" for a project name), but the page shows the raw
text. There was no way to curate presentation (fix capitalization, improve wording) without
modifying the immutable facts.

## Decision
Two-layer curation architecture:

**Layer 1 — Fact Display Overrides (pre-composition):**
- New `fact_display_overrides` table stores per-fact presentation adjustments.
- Applied in memory before the page composer runs — composer stays unchanged.
- Per-fact hash guard: if the underlying fact changes, the override is invalidated.
- Adding a new fact does NOT invalidate other facts' overrides (per-item isolation).

**Layer 2 — Section Copy State (post-composition, existing):**
- Section-level text overrides (bio description, hero tagline) continue unchanged.
- Extended with source="agent" for direct agent writes (highest priority).
- LLM personalizer skips sections with source="agent".

**Unified agent tool:** `curate_content` routes to the appropriate layer based on
whether `factId` is provided.

**Worker "page curator":** Weekly job in deep heartbeat analyzes sections and creates
proposals via existing proposal system. Never overwrites agent-curated content.

## Consequences
- Facts remain immutable — presentation is a separate concern.
- Page composer is untouched — zero risk to existing composition logic.
- Per-item hash guards prevent cascading invalidation.
- Existing proposal UI (ProposalBanner) works for worker suggestions.
- Migration 0032 adds one table + updates job_type CHECK.
