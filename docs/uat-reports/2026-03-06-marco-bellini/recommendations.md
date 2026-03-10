# Fix Recommendations — Priority Order

## Monday Sprint

### 1. Rate limiter localhost bypass (P1)
**File:** `src/lib/middleware/rate-limit.ts`
**Effort:** Small
**Fix:**
- Add `NODE_ENV === 'development'` check to bypass or use session-based bucketing
- Or: use session ID from cookie as rate limit key when IP is "unknown"
- Test: run UAT script with 50 messages without 429s

### 2. Immediate fact saving enforcement (P2)
**Files:** `src/lib/agent/policies/first-visit.ts`, potentially `route.ts`
**Effort:** Medium
**Fix options (pick one):**
- A) Strengthen prompt: add explicit "NEVER respond without saving facts if user gave new info"
- B) Add post-turn audit in `onFinish`: compare user message entity count vs tool calls
- C) Add a "fact saving reminder" injection when turn has 0 tool calls but user message is long
**Test:** Run msgs #4 and #5 scenario — user provides 4+ entities, verify all saved immediately

### 3. Anthropic 429 → proper error propagation (P2)
**File:** `src/app/api/chat/route.ts`
**Effort:** Small
**Fix:**
- Catch `APIError` from Anthropic SDK, check for status 429
- Return 429 to client with `Retry-After` header
- Return user-friendly message in stream format
**Test:** Simulate Anthropic rate limit, verify client gets 429 not 500

### 4. Action claim guard Italian patterns (P3)
**File:** `src/lib/agent/action-claim-guard.ts`
**Effort:** Small
**Fix:**
- Add Italian patterns: "fatto", "corretto", "aggiornato", "modificato", "cambiato"
- Also handle the no-op case: agent says "done" when data was already correct
- Consider: if user requests a correction and agent says "done" with 0 tools, inject a clarification like "I checked and it was already correct"
**Test:** Send "Il premio ADI era 2024, non 2023" when it's already 2024, verify no false "Fatto!"

### 5. Clarification loop cap (P3)
**Files:** Agent policies (active-fresh, active-stale, draft-ready)
**Effort:** Small
**Fix:**
- Ensure "make X more visible" type requests trigger immediate `reorder_sections` without asking
- Already partially addressed by immediate execution directives — may need stronger wording
**Test:** Send "metti in evidenza i premi" and verify agent acts without asking

### 6. Missing facts: Tannico, Satispay, Pixel (P3)
**Root cause:** Same as Bug #2 (delayed fact saving)
**Verification:** After fixing Bug #2, re-run the same message sequence and verify all entities saved

## Future Improvements (Not Urgent)

- **UAT script robustness:** The bash script at `/tmp/uat-runner.sh` and node script at `scripts/uat-chat-agent.mjs` should handle rate limits with exponential backoff
- **Token budget monitoring:** Add a `/api/debug/token-usage` endpoint for dev mode to track daily token consumption during UAT
- **Multi-session rate limit:** Consider per-session rate limiting in addition to per-IP for production
