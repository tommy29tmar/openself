# Design Doc — UAT Bug Fixes Round 3

## Origin

5 bugs discovered during Elena Rossi UAT session (2026-03-10, 12 turns). Full report: `uat/2026-03-10-elena-rossi/UAT-REPORT.md`.

## Approach

Minimal targeted fixes (Approach A), refined through multi-model adversarial challenge (Gemini + Codex + Claude, 2 rounds). Challenge artifacts: `/tmp/brainstorm-challenge/`.

## Bug Fixes

### BUG-1: Confirmation Deadlock for Multiple Deletions (HIGH)

**Root Cause**: `batch_facts` pre-flight (tools.ts:502-515) blocks ALL batches with 2+ deletes unconditionally. The pending-consume logic in `deleteGate` (tools.ts:288-297) is never reached. Even after user confirmation, the pre-flight re-fires.

**Fix (3 parts)**:

1. **`confirmationId` parameter**: Add optional `confirmationId?: string` to `batch_facts` schema. When returning REQUIRES_CONFIRMATION, include an opaque `confirmationId` in the response. On retry, agent passes it back. If valid, pre-flight is bypassed. Deterministic — no fragile array matching.

2. **`_batchPreflightConfirmed` flag**: After pre-flight consumes pending, set flag. `deleteGate` skips count-based blocking when flag is true. Without this, 2nd delete in batch still deadlocks.

3. **Deferred consume**: Pending is consumed AFTER successful execution, not before. If batch fails mid-execution, confirmation stays valid for retry.

**Prompt update**: TOOL_POLICY BULK DELETION section — "when batch_facts returns REQUIRES_CONFIRMATION with a confirmationId, retry the same batch_facts call including the confirmationId."

### BUG-2: Action Claim Guard Rewrites `request_publish` Response (MEDIUM)

**Root Cause**: `request_publish` succeeds but `didToolActuallyCompleteAction` returns false (proposal tool). Agent's response triggers claim guard → generic fallback "Non l'ho ancora eseguito" confuses user.

**Fix**: Track `sawSuccessfulProposal` + proposal tool name in the stream transform. In `flush()`, when the only tools were proposals and text matches action claim, use per-tool fallback:
- `request_publish` → "La pubblicazione è in attesa — usa il tasto di conferma per procedere." / "The publish is pending — use the confirmation button to proceed."
- `propose_soul_change` → "La proposta è stata registrata." / "The proposal has been registered."
- `propose_lock` → "La proposta di blocco è stata registrata." / "The lock proposal has been registered."

Also update `sanitizeUnbackedActionClaim` (non-stream path) with same logic via journal entries.

### BUG-3: `search_facts` FTS Returns Empty Results (MEDIUM)

**Root Cause**: `searchFacts()` uses `LIKE '%full query%'` — requires entire query as substring in ONE field. Multi-word queries like "contact email" fail because "contact" is in category and "email" is in key — no single field contains both.

**Fix**: Split query into terms, AND between terms × OR between fields. Each term must match at least one field; all terms must match.

FTS5 rejected: facts cap 120/profile, search_facts is fallback tool (KNOWN FACTS is primary), migration cost not justified.

### BUG-4: ANSA Experience Duplication (LOW)

**Root Cause**: Agent creates replacement fact with different key when delete fails, leaving duplicate.

**Fix**: Prompt-only. Add to TOOL_POLICY: "When delete_fact fails or returns REQUIRES_CONFIRMATION, do NOT create a replacement fact with a different key. Wait for the delete to succeed. Creating with a new key causes duplicates."

### BUG-5: Unbacked Claim After Partial Tool Success (LOW)

**Root Cause**: `review_soul_proposal(accept: true)` counts as successful mutation, backing general "aggiornato il profilo" claim even though identity data wasn't saved (blocked by REQUIRES_CONFIRMATION).

**Fix**: Prompt-only. Add to TOOL_POLICY: "When SOME tools succeed and others return REQUIRES_CONFIRMATION in the same turn, report each result individually. Do NOT use general completion claims. List what succeeded and what needs confirmation."

Stream-level fix rejected: breaks mixed-success states, doesn't work on non-stream path (route.ts:383).

## Files Changed

| File | Bug | Change |
|------|-----|--------|
| `src/lib/agent/tools.ts` | 1 | `confirmationId` param + `_batchPreflightConfirmed` bypass + deferred consume |
| `src/lib/agent/action-claim-guard.ts` | 2 | `sawSuccessfulProposal` tracking + per-tool fallback text + PROPOSAL_TOOL_NAMES |
| `src/lib/services/kb-service.ts` | 3 | Word-split `searchFacts` |
| `src/lib/agent/prompts.ts` | 1,4,5 | TOOL_POLICY updates (3 additions) |

## Challenge Summary

**Held up**: Per-tool proposal fallback (BUG-2), word-split LIKE (BUG-3), prompt-only for BUG-4.

**Changed**: BUG-1 from set-matching to `confirmationId` (Gemini + Codex). BUG-5 from stream taint to prompt-only (all three). BUG-4 dropped code-level similarity check (Codex).

**Rejected**: FTS5 (facts cap 120), stream-level `sawConfirmationRequired` taint (breaks mixed-success), `getCoreField` similarity check (same company ≠ duplicate).
