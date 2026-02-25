# ADR-0007: SSE Preview Upgrade

Status: Accepted (supersedes ADR-0005)
Date: 2026-02-25
Deciders: engineering

## Context

ADR-0005 chose polling over SSE for preview updates due to simplicity. Phase 1a implements SSE with a robust fallback strategy.

## Decision

Preview updates now use Server-Sent Events (SSE) as the primary transport, with automatic fallback to polling.

Implementation:
- `GET /api/preview/stream` — SSE endpoint (runtime=nodejs)
- Adaptive interval: starts at 1s, backs off to 5s when no changes detected
- Keepalive every 15s to prevent connection timeout
- Anti-buffer headers (`X-Accel-Buffering: no`, `Cache-Control: no-cache`)
- Client (`SplitView.tsx`) opens EventSource on mount
- After 5 consecutive `onerror` events, closes SSE and falls back to polling (3s interval)
- Polling uses existing `GET /api/preview` endpoint (unchanged)

## Consequences

**Positive:**
- Near-instant preview updates (sub-second vs 3s polling)
- Reduced server load (no redundant polling when nothing changed)
- Graceful degradation (SSE failure → polling, transparent to user)

**Negative:**
- Requires `runtime = "nodejs"` on the SSE route (no edge runtime)
- Connection management adds complexity (keepalive, error counting, cleanup)

## Alternatives Considered

1. **WebSocket**: Overkill for unidirectional updates. SSE is simpler and sufficient.
2. **Keep polling only**: Works but adds 1.5s average latency and unnecessary server load.
