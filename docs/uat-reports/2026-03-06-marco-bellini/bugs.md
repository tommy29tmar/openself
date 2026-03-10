# UAT Bugs — 2026-03-06

## Bug 1: Rate limiter shares bucket for all localhost sessions (P1)

**File:** `src/lib/middleware/rate-limit.ts`

**Description:**
`getClientIp()` returns `"unknown"` when no `x-forwarded-for` header is present (localhost dev).
All sessions hitting the server from localhost share the same rate limit bucket keyed to `"unknown"`.
After ~15 messages (30 requests including tool calls within the same request), the rate limiter
started returning 429 for every subsequent request.

**Impact:** Makes local UAT testing impossible beyond ~15 messages. Also affects any multi-tab
local dev scenario.

**Reproduction:**
1. Start dev server locally (`npm run dev`)
2. Send 15+ messages via API in quick succession (30s apart)
3. Observe 429 responses starting around message 16

**Suggested fix:**
- In dev mode, either disable rate limiting or use session ID as the bucket key instead of IP.
- Alternatively, make `getClientIp()` return a unique identifier per session when IP is unknown.

---

## Bug 2: Facts not saved immediately despite policy (P2)

**Files:** `src/lib/agent/policies/first-visit.ts`, `src/app/api/chat/route.ts`

**Description:**
The first-visit policy explicitly states: "Record EVERY piece of information as a fact IMMEDIATELY
via create_fact or batch_facts. Do NOT wait."

However, the agent accumulated information across msgs #4 and #5 without creating any facts,
then batch-saved everything in msg #6. Specifically:
- Msg #4: Velasca, Tannico, Satispay, Google Italia — 0 tools called
- Msg #5: Escursionismo, chitarra, Pixel, fotografia — 0 tools called
- Msg #6: batch_facts finally saved YouTube and social links, but still missed Tannico, Satispay, Pixel

**Missing facts never created:**
- Tannico (client)
- Satispay (client)
- Pixel (pet, border collie)

**Impact:** Data loss. If the session ended after msg #5, all that info would be gone.

**Suggested fix:**
- Strengthen the policy prompt with explicit penalty language for skipping saves
- Consider a post-turn audit that flags when user provided new info but no create_fact/batch_facts was called
- Potentially add a guardrail in `onFinish` callback that checks for unsaved entity mentions

---

## Bug 3: Anthropic API 429 returned as HTTP 500 (P2)

**File:** `src/app/api/chat/route.ts`

**Description:**
When the Anthropic API returns a 429 (rate limit exceeded — 50k input tokens/min),
the chat route catches the error and returns HTTP 500 to the client instead of
propagating the 429 status or returning a more informative error.

The client sees a generic server error with no indication that it's a transient rate limit issue.

**Impact:** Client can't distinguish between server bugs and rate limits. No retry-after header.

**Suggested fix:**
- Catch Anthropic SDK rate limit errors specifically
- Return 429 with appropriate retry-after header
- Include a user-friendly message like "The AI is busy, please wait a moment"

---

## Bug 4: Action claim guard misses no-op claims (P3)

**File:** `src/lib/agent/action-claim-guard.ts`

**Description:**
At msg #13, the user said "Il premio ADI era 2024, non 2023." The agent responded
"Fatto! L'anno del premio ADI è ora 2024." with 0 tool calls.

The ADI fact already had year=2024 (it was created correctly in msg #7), so the agent
correctly identified no change was needed — but it CLAIMED it made a change ("Fatto!").
The action claim guard should have caught this unbacked claim, but didn't.

**Root cause:** The claim guard checks for action verbs paired with 0 tool calls,
but "Fatto" (done) may not be in the Italian detection patterns, or the guard's
regex may not match this specific phrasing.

**Impact:** User gets false confirmation of changes that weren't made. Erodes trust.

**Suggested fix:**
- Add "fatto" / "corretto" / "aggiornato" to the Italian claim detection patterns
- Consider a smarter approach: if user requests a change and agent responds affirmatively
  with 0 tool calls, flag it regardless of language

---

## Bug 5: No minimum profile check before publish (P3)

**File:** `src/lib/agent/policies/first-visit.ts`

**Description:**
The first-visit policy defines SPARSE_PROFILE_FACT_THRESHOLD (10 facts minimum before
Phase C / page generation). However, the agent moved to publish after just 6 user messages
and ~15 facts. While this exceeded the threshold, the agent didn't thoroughly explore
all clusters before moving to publish.

The policy defines 3 cluster exploration phases (turns 3-8), but the agent compressed
the entire cluster exploration into turns 3-5 and jumped to page generation at turn 6.

**Impact:** Less rich profile than intended. Missing facts for hobbies, education, etc.

**Suggested fix:**
- Consider enforcing minimum turn count before Phase C transition
- Or enforce that at least 2 of 3 clusters must be explored with saved facts

---

## Bug 6: Clarification loop not bounded (P3)

**Files:** Agent prompt / turn management

**Description:**
At msg #14, the user said "Potresti mettere in evidenza i premi?" The agent responded
with a clarification question instead of just doing it. This is acceptable once,
but the turn management R6 rules say "max 1 follow-up" for optional details.

In a longer session this pattern could repeat, creating a frustrating loop where
the agent asks for permission instead of acting.

**Impact:** Slower user experience, agent feels indecisive.

**Suggested fix:**
- Review immediate execution directives in active-fresh/active-stale policies
- Ensure "make X more visible" type requests trigger immediate reorder_sections
  without clarification
