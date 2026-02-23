# ADR-0001: Project Tracking Model and Baseline Snapshot

Status: Accepted
Date: 2026-02-23
Deciders: OpenSelf engineering

## Context

The repository had a strong architecture document (`docs/ARCHITECTURE.md`) but no
clear operational separation between:
1. long-term architecture intent
2. current implementation reality
3. execution priorities
4. durable technical decisions

This makes it easy for architecture intent to drift away from shipped behavior.

At this snapshot date, the project already has substantial implementation, but also
visible gaps between declared capabilities and runtime behavior (example: page layout
modes are declared in schema but not applied in renderer).

## Decision

Adopt a 4-document tracking model:

1. `docs/ARCHITECTURE.md`
- Purpose: system vision, principles, target design, major architecture.
- Update only when architecture itself changes.

2. `docs/STATUS.md`
- Purpose: factual "what is true now" snapshot (done/partial/missing, risks, quality).
- Update when implementation reality changes.

3. `docs/ROADMAP.md`
- Purpose: prioritized execution plan (`Now/Next/Later`) with definition of done.
- Update at each planning iteration.

4. `docs/decisions/ADR-XXXX-*.md`
- Purpose: durable rationale for important technical choices.
- Add a new ADR whenever a non-trivial architectural or policy tradeoff is made.

## Baseline Snapshot (2026-02-23)

### What is implemented

1. Core app flow exists:
- landing page
- builder with language picker
- chat + live preview
- public `/:username` page rendering

2. AI flow exists:
- streaming chat endpoint
- tool-calling agent
- fact CRUD and page generation/publish tooling

3. Data layer exists:
- SQLite schema and migrations
- taxonomy normalization
- visibility policy
- usage tracking and budget guardrails
- event logging

4. Quality baseline:
- automated tests passing (36/36 at snapshot time)

### Main gaps

1. `style.layout` supports `centered|split|stack` in schema, but renderer behavior is
effectively single-layout in public pages.
2. Section schema declares more component types than renderer currently supports.
3. Theme contracts are inconsistent across prompt/tool text vs actual CSS/UI themes.
4. Publish approval requirement is mostly prompt/policy-level and should be enforced
as explicit backend state.
5. Connectors and async worker loop are scaffolded but not fully operational end-to-end.

## Consequences

Positive:
1. Team gets a single source for "what is real now" without polluting architecture docs.
2. Planning and execution become explicit and auditable.
3. Important decisions keep rationale and can be revisited safely.

Negative:
1. More docs to maintain.
2. Requires discipline to keep status and roadmap updated after implementation changes.

## Alternatives Considered

1. Keep everything in `docs/ARCHITECTURE.md`
- Rejected: architecture becomes a mixed vision/progress document and loses clarity.

2. Use only issue tracker/project board, no repo docs
- Rejected: repository no longer self-describes technical status and decisions.

3. Track progress in ad-hoc PR descriptions
- Rejected: fragmented history, weak discoverability, poor long-term maintainability.

## Update Policy

1. Any merged implementation that changes product reality updates `docs/STATUS.md`.
2. Any re-prioritization updates `docs/ROADMAP.md`.
3. Any significant architectural/policy tradeoff creates a new ADR.
4. `docs/ARCHITECTURE.md` is updated only when target architecture changes.
