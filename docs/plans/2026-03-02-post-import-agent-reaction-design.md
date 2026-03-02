# Post-Import Agent Reaction — Design

## Problem

After a LinkedIn ZIP import, the agent has no awareness that data was just imported. It treats the user as if they gradually shared facts via conversation. The import is a unique opportunity to enrich the profile and understand the user — it shouldn't be wasted.

## Goals

1. Agent auto-reacts to import with a brief review + targeted question
2. Agent identifies gaps in imported data and explores them over 3-5 conversational turns
3. Agent is flexible: if user asks to generate the page at any point, it complies immediately
4. System is secure, idempotent, and resilient to edge cases

## Architecture: Situation-Based (Approach A)

### 1. Detection: `has_recent_import` Situation

In `journey.ts`, `detectSituations()` adds a new flag `has_recent_import`. Query:

```sql
SELECT COUNT(*) FROM facts
WHERE source = 'connector'
  AND createdAt > datetime('now', '-30 minutes')
  AND sessionId IN (readKeys)
```

If count > 0 → `has_recent_import = true`.

### 2. Server-Side Flag: `pending_import_event`

#### Write (import handler)

After `batchCreateFacts()` succeeds, the import endpoint writes a flag to session metadata:

```ts
setSessionMeta(scope.knowledgePrimaryKey, "pending_import_event", {
  importId: crypto.randomUUID(),
  factsWritten: report.factsWritten,
  timestamp: Date.now(),
  status: "pending",  // pending → processing → consumed
});
```

#### Consume (chat route)

On the next POST `/api/chat`, `assembleBootstrapPayload()` checks for `pending_import_event`:

1. If present and `status === "pending"`:
   - Atomically set `status = "processing"` (CAS: only if still "pending")
   - Generate gap report via `analyzeImportGaps()`
   - Inject context block into system prompt
2. After successful LLM response:
   - Set `status = "consumed"`
3. If LLM call fails:
   - Reset `status = "pending"` (safe retry)

#### Guardrails

- **Atomic consume (G1)**: CAS/transaction on status transition. In multi-tab, only the first POST that sees "pending" wins. Second tab sees "processing" and skips.
- **Error recovery (G2)**: Three-state machine: `pending → processing → consumed`. If processing fails (LLM error), revert to pending. Agent retries on next message.
- **TTL (G3)**: Flag expires after 24 hours. `if (Date.now() - timestamp > 24 * 60 * 60 * 1000) → delete flag, skip`. Prevents stale triggers days later.
- **Idempotency**: `importId` ensures the same import event is never processed twice. If consumed, any subsequent check skips silently.

### 3. Frontend Trigger

After import success, the frontend sends a real message in the chat:

```ts
sendMessage({
  content: "Ho importato il mio profilo LinkedIn",
  metadata: { source: "auto_import_trigger" }
});
```

- **Marked as `source: auto_import_trigger` (G4)**: UI can render this differently (e.g., subtle system-style bubble) to distinguish from real human input.
- The message is real (visible in chat history), not a hidden system injection.
- This triggers the POST to `/api/chat` which finds and consumes the flag.

### 4. Gap Analysis (`analyzeImportGaps()`)

New file: `src/lib/connectors/import-gap-analyzer.ts`

Deterministic, zero-LLM function. Examines facts with `source="connector"` and produces:

```ts
type ImportGapReport = {
  summary: ImportSummary;    // structured data for the context block
  gaps: ImportGap[];         // prioritized list of gaps
};

type ImportSummary = {
  currentRole?: string;      // "Financial Analytics at CDP (since 2018)"
  pastRoles: number;         // count
  educationCount: number;
  languageCount: number;
  skillCount: number;
  certificationCount: number;
};

type ImportGap = {
  priority: number;          // 1 = highest
  type: "empty_category" | "no_personal_description" | "no_social_links";
  description: string;       // human-readable for agent context
};
```

Gap detection rules (prioritized):
1. **No interests/hobbies** — LinkedIn never exports these → highest value
2. **No personal description** — LinkedIn summary may be empty or too formal/corporate
3. **No social links** — website, GitHub, etc.

NOT flagged as gaps: dates (now fixed), skill counts, certification details.

### 5. Agent Context Block (Prompt Hygiene — G5)

When the flag is consumed, the system prompt includes:

```
--- BEGIN IMPORT CONTEXT ---
LINKEDIN IMPORT JUST COMPLETED:
The user just imported their LinkedIn profile.

IMPORTED DATA SUMMARY:
- Current role: [sanitized text, max 100 chars]
- Past experiences: [count] roles
- Education: [count] entries
- Languages: [count]
- Skills: [count]
- Certifications: [count]

GAPS TO EXPLORE (prioritized):
1. [gap description, sanitized]
2. [gap description, sanitized]
3. [gap description, sanitized]
--- END IMPORT CONTEXT ---
```

Prompt hygiene:
- All imported text is sanitized: strip control characters, cap length (100 chars per field)
- Clear delimiters (`--- BEGIN/END IMPORT CONTEXT ---`) to prevent prompt injection from LinkedIn fields
- No raw user-controlled text injected without sanitization
- Category counts only (not raw skill names or company names in the summary block)

### 6. Agent Policy (`recentImportDirective`)

Added to `src/lib/agent/policies/situations.ts`:

```
POST-IMPORT REVIEW MODE:
The user just imported their LinkedIn profile. Your job is to review the data
and fill the gaps that LinkedIn doesn't cover.

RULES:
- Briefly acknowledge the import (1-2 sentences, mention current role + one distinctive element)
- Ask ONE open-ended question about the top gap
- Do NOT recite numbers, lists, or inventory of imported data
- In subsequent turns, explore remaining gaps one at a time
- If the user asks to generate the page at any point, do it immediately — no resistance
- After 3-5 enrichment questions, propose generating the page
- Keep the tone conversational, not interrogative
```

### 7. Conversation Flow

| Turn | Agent does... | Exit condition |
|------|--------------|----------------|
| 1 | Brief ack + first question (interests/hobbies) | User says "genera" → generate immediately |
| 2 | Follow-up on personal aspects | User says "basta" → propose generation |
| 3 | Question on specific gap (description, goals) | — |
| 4 | Propose page generation | — |
| 5+ | Only if user wants to continue | — |

The agent never forces a fixed number of turns. Early exit is always honored.

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/lib/connectors/import-gap-analyzer.ts` | NEW — gap analysis function |
| `src/lib/agent/journey.ts` | MODIFY — add `has_recent_import` to `detectSituations()` |
| `src/lib/agent/policies/situations.ts` | MODIFY — add `recentImportDirective()` |
| `src/lib/agent/context.ts` | MODIFY — inject import context block when flag present |
| `src/app/api/chat/route.ts` | MODIFY — consume flag + error recovery |
| `src/app/api/connectors/linkedin-zip/import/route.ts` | MODIFY — write flag after success |
| `src/lib/services/session-meta.ts` | NEW or MODIFY — `setSessionMeta`/`getSessionMeta`/`casSessionMeta` |
| `src/components/connectors/ConnectorSection.tsx` | MODIFY — send auto-trigger message after import |
| Tests | NEW — gap analyzer, flag lifecycle, situation detection, policy |

## Guardrails Summary

| # | Guardrail | Implementation |
|---|-----------|---------------|
| G1 | Atomic consume | CAS on status: pending → processing (SQLite transaction) |
| G2 | Error recovery | Three-state: pending → processing → consumed. Revert on LLM failure |
| G3 | TTL | 24h expiry on flag. Stale flags deleted silently |
| G4 | Message provenance | Frontend message has `metadata.source = "auto_import_trigger"` |
| G5 | Prompt hygiene | Sanitize imported text, clear delimiters, cap field lengths |
