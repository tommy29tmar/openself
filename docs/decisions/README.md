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
