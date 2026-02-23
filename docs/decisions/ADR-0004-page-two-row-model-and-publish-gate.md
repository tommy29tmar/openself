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

The page table schema (`src/lib/db/schema.ts`) includes a `status` column with values
`draft`, `approval_pending`, and `published`.

## Decision

1. Adopt a two-row model in the `page` table:
   - **Draft row** (`id="draft"`): written by the page composer on every regeneration
     during the editing session. Used by the preview endpoint.
   - **Published row** (`id=<username>`): written only when the user explicitly
     confirms publish. Served at the public `/:username` route.

2. Page lifecycle states: `draft` -> `approval_pending` -> `published`.

3. Enforce a server-side publish gate:
   - The agent tool `publish_page` composes the page and writes it. In the current
     implementation, publish is gated at the prompt and tool level (the agent is
     instructed to ask for user confirmation before calling the tool).
   - The architectural intent is to evolve toward a `request_publish` model where the
     agent can only propose publication, and the user must confirm via a dedicated
     `POST /api/publish` endpoint. The `confirmPublish()` operation would be atomic
     (SQLite transaction): read draft, validate, write published row.

4. Reserved usernames are enforced to prevent conflicts with application routes and
   common abuse patterns.

## Consequences

Positive:
1. Editing never breaks the live page: the published row is immutable until the next
   explicit publish.
2. Publish requires explicit user consent, enforcing the "LLM proposes, application
   enforces" principle.
3. Preview and public rendering use separate rows, avoiding race conditions between
   in-progress edits and live content.
4. Atomic publish operation prevents partial or corrupted page states.
5. Reserved username enforcement prevents route collisions (e.g. `/api`, `/builder`).

Negative:
1. More complex DB model: two rows per user instead of one, with status management.
2. Current implementation uses a single `id="main"` row in `page-service.ts` which
   does not yet fully implement the two-row separation. Migration to the target model
   requires updating `upsertPage` and adding the `confirmPublish` endpoint.
3. The publish gate is currently enforced at the prompt/tool level rather than as a
   hard backend constraint. Until `POST /api/publish` is implemented, a compromised
   or misbehaving agent could technically publish without user confirmation.

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
