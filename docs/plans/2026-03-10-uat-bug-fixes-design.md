# Challenge Synthesis — 3 Models, 2 Rounds

## What held up under scrutiny:

- **Fix 1 (Thinking)**: `onStepFinish` is the correct approach. No pushback from any model. Need to verify no double-logging with single-step requests.
- **Fix 10 (create_fact profileId)**: 1-line fix, zero risk. All models agree. First in implementation order.
- **Fix 5 (update_page_style URL)**: Fix the self-call URL, do NOT rewrite the tool to bypass the route. The route has important side-effects (auto-compose, validation, SSE).

## What changed:

- **Fix 2+3 → Kill `update_fact`**: All 3 models converge. `update_fact` is fundamentally unreliable for LLMs (UUID tracking across turns). Replace with immutable-fact pattern: delete+create via `batch_facts` or explicit delete_fact+create_fact. Eliminates bugs 2 and 3 simultaneously.
- **Fix 2 addendum — `delete_fact` needs category/key**: If we kill `update_fact`, the LLM needs to delete by category/key. `delete_fact` must accept both UUID and category/key. Ambiguity resolved by: delete ALL matching facts for that owner+category+key (self-healing duplicates).
- **Fix 4 → Registration-time backfill, not SQL migration**: When user registers and sessions link to profile, atomically update `profileId` on all facts from those sessions. Then all queries use `WHERE profileId = cognitiveOwnerKey` exclusively. No OR clauses.
- **Fix 9 → Prompt rule first, tool-split only if needed**: The directive exists in `situations.ts` but Haiku ignored it. Strengthen the prompt rule. If still ignored after prompt fix, split into `propose_soul`+`apply_soul` tools. Don't build stateful heuristic gates.
- **Fix 8 → DEFERRED**: All 3 models agree. Text glitches are minor cosmetic issues. Don't touch the stream. Root-cause TBD (server vs client assembly).

## What was rejected (with reason):

- **OR query in searchFacts**: Mixing profileId and sessionId in OR is data leakage risk. Rejected by all 3 models.
- **Direct service call in update_page_style**: Route has critical side-effects. Rejected by Gemini and Codex.
- **Stateful heuristic gate for soul proposals**: History-parsing in tool layer is fragile. Rejected by Gemini R1+R2 and Codex R2.
- **Stream-level text normalization**: Byte-stream patching for cosmetic LLM artifacts is wrong layer. Rejected unanimously.

## Open risks (with mitigation):

- **delete_fact "delete all matching"**: Could delete more than intended if category/key is ambiguous (e.g., two legitimate "education/university" facts). Mitigation: return count of deleted facts in tool response so agent knows what happened. If count > 1, agent can inform user.
- **Registration-time backfill race**: If user is chatting (creating facts) while registration completes, new facts might miss the backfill. Mitigation: backfill uses a transaction that locks the facts table for the affected sessionIds.
- **onStepFinish + onFinish double-logging**: For single-step requests, reasoning might appear in both callbacks. Mitigation: only log in onStepFinish, remove reasoning logging from onFinish.
- **Soul proposal prompt rule**: Haiku may still ignore strengthened prompt. Mitigation: monitor via UAT; if still fails, implement tool-split as Phase 2.

## Final Design (10 fixes)

### Fix 1 — THINK-001: Per-step reasoning logging
- Add `onStepFinish` callback to `streamText()` in `chat/route.ts`
- Log `[thinking]` with step index, reasoning, finishReason
- Remove reasoning logging from `onFinish` (avoid double-log)
- Console-only (no DB persistence — keep it simple)

### Fix 2+3 — FACT-001 + FACT-002: Kill `update_fact`, immutable facts
- Remove `update_fact` tool from `tools.ts`
- Remove from tool-filter whitelist
- Add system prompt rule in TOOL_POLICY: "Facts are immutable. To correct a fact: (1) delete the wrong fact, (2) create the corrected fact. Never leave incorrect facts active."
- Ensure `batch_facts` supports `action: "delete"` with category/key targeting

### Fix 2 addendum — `delete_fact` accepts category/key
- Modify `delete_fact` in `tools.ts` to accept either UUID or `category/key` format
- Resolution: find all matching facts for owner+category+key, delete ALL (self-healing duplicates)
- Return `{ success: true, deletedCount: N }` so agent can report to user
- Add `findFactsByOwnerCategoryKey(ownerKey, category, key)` to kb-service

### Fix 4 — SEARCH-001: Registration-time profileId backfill
- In `registerUser()` (or wherever sessions link to profile): atomically UPDATE `facts SET profileId = newProfileId WHERE sessionId IN (linkedSessionIds) AND profileId = sessionId`
- This ensures anonymous facts get the canonical profileId at registration time
- All kb-service queries remain `WHERE profileId = cognitiveOwnerKey` — no OR clauses
- Also fix `create_fact` tool to pass `effectiveOwnerKey` (Fix 10)

### Fix 5 — STYLE-001: Fix self-call URL
- In `update_page_style` tool, replace `process.env.NEXT_PUBLIC_APP_URL` with proper base URL construction
- Use: `new URL("/api/draft/style", process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:" + (process.env.PORT || 3000))`
- 1-line fix, preserves all route side-effects

### Fix 6 — AGENT-001: Error recovery hints in tool responses
- When tools return errors, include `hint` field with actionable recovery guidance
- Example: `{ success: false, error: "Fact not found", hint: "Use search_facts to find facts, then delete_fact + create_fact to correct them." }`
- Apply to: delete_fact, update_page_style, generate_page, request_publish

### Fix 7 — AGENT-002: Prompt guidance for generate_page timing
- Add to TOOL_POLICY: "Call generate_page only AFTER all fact mutations for the current turn are complete."
- This is a prompt-only fix — no code change needed

### Fix 8 — TEXT-001: DEFERRED
- Root-cause TBD (server streaming vs client assembly)
- No action in this iteration

### Fix 9 — SOUL-001: Strengthen prompt rule for soul proposal presentation
- Strengthen existing directive in `situations.ts` to be more explicit
- Add to shared-rules: "NEVER call review_soul_proposal(accept: true) without first describing the proposed changes to the user in a previous message and receiving explicit approval."
- Monitor via UAT. If Haiku still ignores, implement tool-split as Phase 2.

### Fix 10 — create_fact profileId consistency
- In `create_fact` tool, add `effectiveOwnerKey` as 3rd argument to `createFact()`
- 1-line fix, matches existing `batch_facts` pattern

## Implementation Order

1. Fix 10 — create_fact profileId (1-line, zero risk)
2. Fix 1 — onStepFinish thinking (isolated, no side-effects)
3. Fix 5 — update_page_style URL (1-line, no side-effects)
4. Fix 4 — Registration-time profileId backfill (requires careful testing)
5. Fix 2+3 — Kill update_fact + delete_fact category/key (tool API change)
6. Fix 6 — Error recovery hints (additive, no risk)
7. Fix 7 — Prompt guidance (prompt-only)
8. Fix 9 — Soul proposal prompt rule (prompt-only)
9. Fix 8 — DEFERRED

## Files to modify

- `src/app/api/chat/route.ts` — Fix 1 (onStepFinish)
- `src/lib/agent/tools.ts` — Fix 2/3 (kill update_fact), Fix 5 (URL), Fix 6 (hints), Fix 10 (profileId)
- `src/lib/services/kb-service.ts` — Fix 2 (findFactsByOwnerCategoryKey), Fix 4 (ensure canonical queries)
- `src/lib/auth/session.ts` or `src/lib/services/user-service.ts` — Fix 4 (registration backfill)
- `src/lib/agent/prompts.ts` or `src/lib/agent/policies/shared-rules.ts` — Fix 7 (generate_page timing)
- `src/lib/agent/policies/situations.ts` — Fix 9 (soul proposal directive)
- `src/lib/agent/tool-filter.ts` — Fix 2 (remove update_fact from whitelist)
