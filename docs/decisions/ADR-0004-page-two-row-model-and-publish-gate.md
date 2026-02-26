# ADR-0004: Page Two-Row Model and Publish Gate

Status: Accepted
Date: 2026-02-23
Deciders: OpenSelf engineering

## Context

Users build their personal page through conversation with the AI agent. The page is
regenerated from facts after each agent turn, giving instant preview feedback. At some
point the user decides to publish, making the page publicly accessible at `/:username`.

A naive approach (single row, overwrite on every generation) means the live public URL
changes every time the agent regenerates the page during an editing session. Users
would see their published page flicker through intermediate states. There is also a
trust concern: the LLM agent should not be able to push content live without explicit
user consent.

## Decision

1. Adopt a two-row model in the `page` table:
   - **Draft row** (`id="draft"`): written by the page composer on every regeneration
     during the editing session. Used by the preview endpoint.
   - **Published row** (`id=<username>`): written only when the user explicitly
     confirms publish. Served at the public `/:username` route.

2. Page lifecycle states: `draft` → `approval_pending` → `published`.

3. Enforce a server-side publish gate:
   - The agent tool `request_publish` marks the draft as `approval_pending` and sets
     the intended username. It does not recompose the page from facts, so manual
     changes (theme, section order, content edits) are preserved.
   - The user confirms via `POST /api/publish`, which calls `confirmPublish()` — an
     atomic SQLite transaction that reads the draft, creates/updates the published row
     (`id=<username>`, `status="published"`), and resets the draft to `status="draft"`.
   - `confirmPublish()` enforces guards: draft must be `approval_pending`, username
     must not be reserved, and any previously published page with a different username
     is de-published in the same transaction (single-identity model).

4. Reserved usernames (`draft`, `api`, `builder`, `admin`, `_next`) are enforced in
   the service layer (`RESERVED_USERNAMES` set in `requestPublish()` and
   `confirmPublish()`). The DB CHECK constraint specifically blocks `username="draft"`
   on published rows; the remaining reserved names are service-layer only.

5. DB CHECK constraints enforce state invariants:
   - Draft row (`id="draft"`) cannot have `status="published"`
   - Non-draft rows can only have `status="published"`
   - Username `"draft"` cannot appear on a published row

## Consequences

Positive:
1. Editing never breaks the live page: the published row is immutable until the next
   explicit publish.
2. Publish requires explicit user consent, enforcing the "LLM proposes, application
   enforces" principle as a hard backend constraint.
3. Preview and public rendering use separate rows, avoiding race conditions between
   in-progress edits and live content.
4. Atomic publish operation prevents partial or corrupted page states.
5. Reserved username enforcement prevents route collisions (e.g. `/api`, `/builder`).
6. `request_publish` preserves manual changes (no recomposition from facts).

Negative:
1. More complex DB model: two rows per identity instead of one, with status management.
2. ~~The publish endpoint (`POST /api/publish`) has no auth or CSRF protection.~~ Resolved
   in ADR-0008: multi-user mode requires authentication (403 for anonymous), username is
   enforced from auth context, and claim+publish is atomic.
3. Single-identity assumption: `confirmPublish()` deletes all published rows with a
   different username. This must be scoped per-user if a multi-identity model is adopted.

## Alternatives Considered

1. Single-row model (overwrite on every generation)
   - Rejected: published page changes during editing, no separation between draft and
     live content, no publish consent mechanism.

2. Versioned rows (append-only history)
   - Deferred: stronger auditability but adds storage and query complexity beyond MVP
     needs. Can be added later as the page model matures.

3. LLM-controlled publish (agent decides when to publish)
   - Rejected: violates the "LLM proposes, application enforces" principle. User must
     always be in the loop for actions that affect public-facing content.
