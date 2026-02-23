# ADR-0005: Preview Polling over SSE

Status: Accepted
Date: 2026-02-23
Deciders: OpenSelf engineering

## Context

The builder UI shows a live preview of the user's page that updates as the agent
extracts facts from conversation. The preview endpoint (`src/app/api/preview/route.ts`)
returns the current `PageConfig` composed from stored facts.

Two standard approaches exist for keeping the preview in sync:
1. **Polling**: the client periodically fetches `GET /api/preview` at a fixed interval.
2. **Server-Sent Events (SSE)**: the server pushes updates to the client over a
   persistent HTTP connection whenever the page config changes.

SSE provides lower latency and fewer redundant requests but requires connection
management (reconnection, heartbeats, edge/proxy compatibility) and server-side event
dispatching (detecting when facts change and pushing to connected clients).

An earlier design included a multi-state preview state machine:
`idle` -> `synthesizing` -> `synthesis_ready` / `synthesis_failed`. This was designed
to accommodate an async LLM synthesis step in the preview pipeline.

## Decision

1. Use polling at a 3-second interval for preview updates.
2. Simplify the preview state machine to exactly 2 states:
   - `idle`: no facts exist yet, nothing to preview.
   - `optimistic_ready`: facts exist, the composed page config is returned.
3. Remove the `synthesizing`, `synthesis_ready`, and `synthesis_failed` states.
4. The preview state type is defined in `src/lib/page-config/preview-state.ts`:
   `PreviewStatus = "idle" | "optimistic_ready"`.

The `optimistic_ready` state reflects the deterministic composition decision
(ADR-0002): because page composition has no async step, the preview is always
immediately available once facts exist.

## Consequences

Positive:
1. Simpler implementation: no persistent connections, no event dispatching, no
   reconnection logic.
2. Stateless server: each poll is an independent GET request with no server-side
   session tracking.
3. Easier debugging: preview state is inspectable via direct API calls.
4. Works reliably behind any proxy, CDN, or edge network without SSE compatibility
   concerns.
5. Two-state machine is trivial to reason about and test.

Negative:
1. Slight latency: updates appear up to 3 seconds after facts change rather than
   immediately.
2. More network requests: the client sends a request every 3 seconds even when nothing
   has changed. At scale this could become wasteful, though for a local-first
   single-user application the impact is negligible.
3. No push notification capability: if external events (e.g. connector updates) modify
   facts, the user sees the change only on the next poll cycle.

## Alternatives Considered

1. Server-Sent Events (SSE)
   - Deferred to Phase 1: SSE would reduce latency and eliminate redundant requests.
     Implementation would require a pub/sub mechanism to notify connected clients when
     facts change, plus reconnection handling. Worth revisiting once the polling
     baseline is proven stable and if latency becomes a user-facing issue.

2. WebSocket
   - Rejected: heavier than SSE for a unidirectional data flow. WebSocket is better
     suited for bidirectional communication (e.g. collaborative editing), which is not
     a current requirement.

3. Long polling
   - Rejected: adds complexity over simple polling (server holds the request until data
     changes) without the full benefits of SSE. A middle ground that offers neither the
     simplicity of polling nor the efficiency of event streaming.
