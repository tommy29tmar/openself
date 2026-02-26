# Architecture Decision Records (ADR)

This folder stores durable technical decisions.

Use ADRs for:
1. choices that affect architecture or long-term maintenance
2. tradeoffs with meaningful alternatives
3. policy decisions that the team should not "rediscover" later

Do not use ADRs for:
1. daily task progress (use `docs/STATUS.md`)
2. short-term prioritization (use `docs/ROADMAP.md`)
3. aspirational architecture narrative (use `docs/ARCHITECTURE.md`)

## ADR Index

1. `ADR-0001-project-tracking-and-baseline.md` - Adopt separated tracking docs and establish current baseline
2. `ADR-0002-deterministic-page-composition.md` - Deterministic facts-to-sections composition without LLM
3. `ADR-0003-mvp-theme-and-layout-scope.md` - MVP scoped to 2 themes and 1 layout
4. `ADR-0004-page-two-row-model-and-publish-gate.md` - Two-row page model with server-side publish gate
5. `ADR-0005-preview-polling-over-sse.md` - Polling-based preview with simplified state machine
6. `ADR-0006-owner-scope-and-cognitive-architecture.md` - OwnerScope design, multi-session identity, trust ledger, migration bootstrap
7. `ADR-0007-sse-preview-upgrade.md` - SSE preview with polling fallback (supersedes ADR-0005)
8. `ADR-0008-signup-before-publish.md` - Require signup before publish in multi-user mode (resolves ADR-0004 negative #2)
9. `ADR-0009-shared-projection-and-publish-safety.md` - Shared canonical projection and publish safety (hash guard, promote-all, no raw draft serving)

## Naming Convention

Format: `ADR-XXXX-short-kebab-title.md`

Where:
- `XXXX` is a zero-padded sequence (`0001`, `0002`, ...)
- title is concise and specific

## Minimal ADR Template

```md
# ADR-XXXX: Title

Status: Proposed | Accepted | Superseded
Date: YYYY-MM-DD
Deciders: team or owner

## Context

Problem and constraints.

## Decision

What is decided.

## Consequences

Positive and negative outcomes.

## Alternatives Considered

Other options and why they were not chosen.
```
