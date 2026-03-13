# Chat Session Redesign — Concierge Model

## Problem

Three UX issues with the current chat system:

1. **Welcome message mutation**: The welcome message is client-side only (never persisted). It's regenerated on every page load based on current journey state — the original onboarding greeting disappears when user transitions to `active_fresh`.
2. **Full history dump**: ALL messages from ALL sessions loaded with no pagination, no session boundaries.
3. **No "new session" concept**: No way to start a clean conversation.

## Confirmed Direction

**Concierge Model with Session Windows**:
- Clean slate on each new visit (after 2h TTL)
- Server-computed dynamic greeting (template strings, NOT LLM — zero latency, zero cost, zero failure)
- Current session preserved on refresh (within TTL)
- No history UI — user asks the agent for past context (agent has structured memory)
- First_visit greeting stays hardcoded/deterministic ("Come ti chiami?")
- Anonymous users protected: no new session creation, temporal scoping on messages

## Multi-Model Challenge Summary

Design challenged by Gemini + Codex/Claude (2 rounds). Key changes:
- LLM greeting rejected (latency, cost, reliability) → server-computed templates
- GET must not mutate state → bootstrap stays pure read
- 30min TTL too short → 2 hours for content-creation
- Anonymous session orphaning → temporal scoping, not session creation
- Parallel fetch preserved → no waterfall

## Architecture

### Session Activity Window
- `last_message_at` column on `sessions` table
- `SESSION_TTL = 2 hours` (env var `CHAT_SESSION_TTL_MINUTES`, default 120)
- Bootstrap returns `isActiveSession` flag

### Server-Computed Greeting
- Template strings with interpolation from bootstrap data
- Journey-state-aware + situation enrichment
- `first_visit` hardcoded for deterministic onboarding
- Returned in bootstrap payload, NOT persisted until user replies

### Message Loading Scoping
- Temporal filter: `createdAt > ttlCutoff`
- Same for both authenticated and anonymous (no session creation needed)

### Lazy Greeting Persistence
- Client renders greeting from bootstrap payload
- On first user message, greeting persisted as first message in DB
- Prevents phantom records from bounced users
