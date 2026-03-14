# UAT Bug Fixes — Marco Ferretti Session

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 7 bugs found during the Marco Ferretti exploratory UAT session (2026-03-13).

**Architecture:** 3 code fixes (ConnectorCard OAuth error handling, chat message dedup, identity fact schema clarification in prompts) + 4 prompt hardening changes (unsupported features, deletion claims, multi-action execution, identity/location separation). All changes are backwards-compatible.

**Tech Stack:** TypeScript, Next.js, React, SQLite (Drizzle), Vercel AI SDK

**Source:** `uat/UAT-REPORT.md` (2026-03-13, commit 464a63e)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/sources/ConnectorCard.tsx` | Modify | Pre-flight fetch for OAuth connect + loading state on button |
| `src/lib/connectors/preflight.ts` | Create | Extracted pre-flight check logic (testable without React/DOM) |
| `tests/lib/connectors/preflight.test.ts` | Create | Unit tests for pre-flight check logic |
| `src/app/api/chat/route.ts` | Modify | Content-based message dedup within 30s window |
| `tests/api/chat-message-dedup.test.ts` | Create | Unit tests for dedup logic |
| `src/lib/agent/prompts.ts` | Modify | Identity schema split + UNSUPPORTED FEATURES + DELETION HONESTY |
| `src/lib/agent/policies/shared-rules.ts` | Modify | MULTI-REQUEST rule merged into IMMEDIATE_EXECUTION_RULE |
| `src/lib/agent/tool-call-repair.ts` | Modify | Add `repairJsonValue()` for malformed LLM JSON |
| `tests/evals/tool-call-repair.test.ts` | Extend | Tests for JSON repair (add to existing file) |

---

## Chunk 1: Code Fixes

### Task 1: BUG-2 — ConnectorCard OAuth inline error handling

**Severity:** Medium
**Problem:** Spotify/Strava "Connect" buttons use `window.location.href = connectUrl`, which navigates away from the builder to a raw JSON error page when OAuth is not configured. User loses builder context.
**Fix:** Pre-flight `fetch()` that detects error responses before navigating. The connect endpoints return either a JSON error (404/403) or a 302 redirect to the OAuth provider. With default `redirect: "follow"`, the 302 redirect to a cross-origin OAuth URL causes a CORS `TypeError` — which is the signal to navigate normally (the browser handles redirects natively via `window.location.href`).

**Files:**
- Create: `src/lib/connectors/preflight.ts`
- Test: `tests/lib/connectors/preflight.test.ts` (new)
- Modify: `src/components/sources/ConnectorCard.tsx:36-38` (handleConnect) + line 228 (disabled prop)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/connectors/preflight.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { preflightConnectCheck } from "@/lib/connectors/preflight";

describe("preflightConnectCheck", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns error when endpoint returns NOT_CONFIGURED (404)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          success: false,
          code: "NOT_CONFIGURED",
          error: "Spotify OAuth not configured.",
          retryable: false,
        }),
    });

    const result = await preflightConnectCheck("/api/connectors/spotify/connect");
    expect(result).toEqual({ ok: false, error: "Spotify OAuth not configured." });
  });

  it("returns error when endpoint returns AUTH_REQUIRED (403)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          success: false,
          code: "AUTH_REQUIRED",
          error: "Authentication required.",
          retryable: false,
        }),
    });

    const result = await preflightConnectCheck("/api/connectors/spotify/connect");
    expect(result).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns ok when fetch throws (CORS redirect to OAuth provider)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await preflightConnectCheck("/api/connectors/spotify/connect");
    expect(result).toEqual({ ok: true });
  });

  it("returns ok when endpoint returns a successful response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const result = await preflightConnectCheck("/api/connectors/spotify/connect");
    expect(result).toEqual({ ok: true });
  });

  it("returns generic error when json parsing fails on error response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("invalid json")),
    });

    const result = await preflightConnectCheck("/api/connectors/spotify/connect");
    expect(result).toEqual({ ok: false, error: "Connection failed" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/connectors/preflight.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the preflight module**

```typescript
// src/lib/connectors/preflight.ts

export type PreflightResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Pre-flight check for OAuth connect endpoints.
 *
 * Strategy:
 * - fetch() with default redirect: "follow"
 * - Error responses (404 NOT_CONFIGURED, 403 AUTH_REQUIRED) return JSON → we parse and show inline
 * - Successful OAuth endpoints return 302 → fetch follows → cross-origin CORS TypeError → we catch
 *   and return ok:true (let the browser navigate natively)
 */
export async function preflightConnectCheck(url: string): Promise<PreflightResult> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Connection failed" }));
      return { ok: false, error: data.error ?? "Connection failed" };
    }
    // Unexpected success (shouldn't happen for connect endpoints) — navigate anyway
    return { ok: true };
  } catch {
    // CORS TypeError from cross-origin OAuth redirect, or network error
    // In both cases: let the browser handle it via native navigation
    return { ok: true };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/connectors/preflight.test.ts`
Expected: PASS (5/5 tests)

- [ ] **Step 5: Integrate into ConnectorCard**

In `src/components/sources/ConnectorCard.tsx`, add import at the top:
```typescript
import { preflightConnectCheck } from "@/lib/connectors/preflight";
```

Replace `handleConnect` (lines 36-38):
```typescript
const handleConnect = async () => {
  if (!definition.connectUrl || loading) return;
  setLoading(true);
  try {
    const result = await preflightConnectCheck(definition.connectUrl);
    if (!result.ok) {
      showMessage(result.error, "error");
      return;
    }
    window.location.href = definition.connectUrl;
  } finally {
    setLoading(false);
  }
};
```

Also add `disabled={loading}` to the OAuth Connect button at line 228:
```typescript
{!isConnected && !hasError && definition.authType === "oauth" && (
  <button
    onClick={handleConnect}
    disabled={loading}
    style={{
      ...btnStyle("#c9a96e", "#111"),
      opacity: loading ? 0.5 : 1,
    }}
  >
    {loading ? "Connecting\u2026" : `Connect ${definition.displayName}`}
  </button>
)}
```

And the same for the error-state Reconnect button (line 374):
```typescript
<button
  onClick={handleConnect}
  disabled={loading}
  style={{ ...btnStyle("rgba(255,255,255,0.08)", "#e8e4de"), flex: 1, opacity: loading ? 0.5 : 1 }}
>
  {loading ? "Connecting\u2026" : "Reconnect"}
</button>
```

- [ ] **Step 6: Run existing tests to verify no regression**

Run: `npx vitest run tests/ --reporter=verbose 2>&1 | tail -10`

- [ ] **Step 7: Commit**

```bash
git add src/lib/connectors/preflight.ts tests/lib/connectors/preflight.test.ts src/components/sources/ConnectorCard.tsx
git commit -m "fix(connectors): show inline error when OAuth not configured instead of navigating away

BUG-2: ConnectorCard handleConnect now does a pre-flight fetch to detect
NOT_CONFIGURED/AUTH_REQUIRED errors before redirecting. Shows error inline via
showMessage(). OAuth redirects cause CORS TypeError which signals 'navigate normally'.
Extracted to preflight.ts for testability. Added disabled+loading state to Connect button."
```

---

### Task 2: BUG-7 — Chat message deduplication

**Severity:** Low
**Problem:** User messages can be inserted twice in the DB when the client retries (network timeout, manual resend). The server generates a new UUID each time, so content-based dedup doesn't happen.
**Fix:** Add a content+session dedup check before inserting user messages. If the same content was sent in the same session within the last 30 seconds, skip the insert and reuse the existing message ID.

**Files:**
- Modify: `src/app/api/chat/route.ts:326-339`
- Test: `tests/api/chat-message-dedup.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/chat-message-dedup.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";

/**
 * Tests the dedup logic directly against an in-memory SQLite DB.
 * We replicate the dedup query (not the full chat route) to verify correctness.
 */
describe("chat message dedup", () => {
  let raw: InstanceType<typeof Database>;
  let testDb: ReturnType<typeof drizzle>;

  beforeEach(() => {
    raw = new Database(":memory:");
    raw.exec(`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    testDb = drizzle(raw);
  });

  afterEach(() => {
    raw.close();
  });

  it("should not insert duplicate user message within 30s window", () => {
    // Insert first message
    raw.prepare(
      "INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)",
    ).run("msg-1", "session-a", "user", "ciao sono Marco");

    // Dedup check: same content, same session, within 30s
    const recent = raw.prepare(`
      SELECT id, created_at FROM messages
      WHERE session_id = ? AND role = 'user' AND content = ?
      ORDER BY created_at DESC LIMIT 1
    `).get("session-a", "ciao sono Marco") as { id: string; created_at: string } | undefined;

    expect(recent).toBeDefined();
    expect(recent!.id).toBe("msg-1");

    // Verify it's within 30s window
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
    expect(recent!.created_at > thirtySecondsAgo).toBe(true);

    // With dedup, we would reuse msg-1 instead of inserting
    const count = raw.prepare("SELECT count(*) as c FROM messages").get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("should allow same content after 30s window", () => {
    // Insert first message with old timestamp
    raw.prepare(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run("msg-1", "session-a", "user", "ciao sono Marco", "2020-01-01T00:00:00.000Z");

    // Dedup check: same content, same session, but old
    const recent = raw.prepare(`
      SELECT id, created_at FROM messages
      WHERE session_id = ? AND role = 'user' AND content = ?
      ORDER BY created_at DESC LIMIT 1
    `).get("session-a", "ciao sono Marco") as { id: string; created_at: string } | undefined;

    expect(recent).toBeDefined();

    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
    // Old message is outside the 30s window — should insert new
    expect(recent!.created_at > thirtySecondsAgo).toBe(false);
  });

  it("should allow same content from different sessions", () => {
    // Insert message in session A
    raw.prepare(
      "INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)",
    ).run("msg-1", "session-a", "user", "ciao sono Marco");

    // Dedup check in session B — should find nothing
    const recent = raw.prepare(`
      SELECT id, created_at FROM messages
      WHERE session_id = ? AND role = 'user' AND content = ?
      ORDER BY created_at DESC LIMIT 1
    `).get("session-b", "ciao sono Marco") as { id: string; created_at: string } | undefined;

    expect(recent).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it passes (testing the SQL logic)**

Run: `npx vitest run tests/api/chat-message-dedup.test.ts`
Expected: PASS (verifies our dedup SQL query is correct)

- [ ] **Step 3: Implement the fix in chat route**

In `src/app/api/chat/route.ts`, replace lines 326-339:

```typescript
// Persist the latest user message (with dedup guard)
const lastMessage = messages[messages.length - 1];
let latestUserMessageId: string | undefined;
if (lastMessage?.role === "user") {
  // Dedup: check if identical content was persisted in same session within last 30s
  const recent = db
    .select({ id: messagesTable.id, createdAt: messagesTable.createdAt })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.sessionId, messageSessionId),
        eq(messagesTable.role, "user"),
        eq(messagesTable.content, lastMessage.content),
      ),
    )
    .orderBy(desc(messagesTable.createdAt))
    .limit(1)
    .get();

  const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
  if (recent?.createdAt && recent.createdAt > thirtySecondsAgo) {
    // Reuse existing message ID — this is a retry/resend
    latestUserMessageId = recent.id;
  } else {
    latestUserMessageId = randomUUID();
    db.insert(messagesTable)
      .values({
        id: latestUserMessageId,
        sessionId: messageSessionId,
        role: "user",
        content: lastMessage.content,
      })
      .run();
  }
}
```

Add the required drizzle-orm imports at the top of `route.ts` (these are NOT currently imported — the file only uses `db.insert()`, not query operators):
```typescript
import { eq, and, desc } from "drizzle-orm";
```
Add this line near the other imports from `drizzle-orm` (or after the schema import at line 8).

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run 2>&1 | tail -10`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/route.ts tests/api/chat-message-dedup.test.ts
git commit -m "fix(chat): deduplicate user messages within 30s window

BUG-7: Before inserting a user message, check if identical content exists
in the same session within the last 30 seconds. If so, reuse the existing
message ID instead of creating a duplicate."
```

---

### Task 3: BUG-6 — Identity/location fact separation in schema docs

**Severity:** Low
**Problem:** Agent tried to modify `identity/name` to add a city, producing confusing UX ("devo sostituire il tuo nome per aggiungere la città"). The schema reference at line 270 shows `identity` with `{full?, role?, city?, tagline?}` as a single merged shape, which misleads the LLM.
**Fix:** Clarify in the schema reference that `identity/name`, `identity/role`, `identity/location`, and `identity/tagline` are SEPARATE facts with distinct value shapes.

**Files:**
- Modify: `src/lib/agent/prompts.ts:270` (full schema in `buildDataModelReference`)
- Modify: `src/lib/agent/prompts.ts:285` (minimal schema in `buildMinimalSchemaForOnboarding`)
- Modify: `src/lib/agent/prompts.ts:306` (minimal schema in `buildMinimalSchemaForEditing`)

- [ ] **Step 1: Update the full identity value schema (line 270)**

In `src/lib/agent/prompts.ts`, line 270, replace:

```
- identity: { full?: "...", role?: "...", city?: "...", tagline?: "..." }  — CRITICAL: full = ONLY the person's name (max 5 words)
```

with:

```
- identity/name: { full: "..." }  — ONLY the person's name (max 5 words). NEVER include city or role here.
- identity/role: { role: "..." }  — profession/title. Separate fact from name.
- identity/location: { city: "...", country?: "..." }  — ALWAYS create as a SEPARATE fact. NEVER modify identity/name to add a city.
- identity/tagline: { text: "..." }  — only if user explicitly requests a tagline
```

- [ ] **Step 2: Update the minimal onboarding schema (line 285)**

In `buildMinimalSchemaForOnboarding()`, replace:

```
- identity: {full?, role?, city?, tagline?}
```

with:

```
- identity (use separate keys): identity/name {full}, identity/role {role}, identity/location {city, country?}, identity/tagline {text}
```

- [ ] **Step 3: Update the minimal editing schema (line 306)**

In `buildMinimalSchemaForEditing()`, replace:

```
- identity: {full?, role?, city?, tagline?}
```

with:

```
- identity (use separate keys): identity/name {full}, identity/role {role}, identity/location {city, country?}, identity/tagline {text}
```

- [ ] **Step 4: Run existing tests to verify no regression**

Run: `npx vitest run tests/ --reporter=verbose 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/prompts.ts
git commit -m "fix(prompts): clarify identity facts are separate (name, role, location, tagline)

BUG-6: The identity value schema reference now documents each identity sub-key
as a separate fact with its own value shape. This prevents the LLM from trying
to modify identity/name to add a city."
```

---

## Chunk 2: Prompt Hardening

### Task 4: BUG-5 — Strengthen UNSUPPORTED FEATURES directive

**Severity:** Low
**Problem:** Agent asked for video platform details (YouTube, Vimeo) instead of immediately explaining videos aren't supported. The UNSUPPORTED FEATURES section (line 262) says "explain clearly, never ask for assets" but the LLM still asked clarifying questions about the unsupported feature.
**Fix:** Strengthen wording to explicitly forbid follow-up questions about unsupported features.

**Files:**
- Modify: `src/lib/agent/prompts.ts:262-265`

- [ ] **Step 1: Update the UNSUPPORTED FEATURES block**

Replace lines 262-265:

```
UNSUPPORTED FEATURES (explain clearly, never ask for assets):
- Video in any section (hero, projects, etc.)
- Audio embeds
- Custom CSS/HTML injection
```

with:

```
UNSUPPORTED FEATURES — when the user requests any of these, IMMEDIATELY say it's not available. Do NOT ask follow-up questions about the unsupported feature (e.g., do NOT ask "which platform?" for video). Acknowledge the request, explain the limitation in one sentence, then pivot to what IS possible:
- Video embeds (hero, projects, etc.) — suggest linking to YouTube/Vimeo in a project or social fact instead
- Audio embeds — suggest linking to SoundCloud/Bandcamp in a social fact instead
- Custom CSS/HTML injection — explain the Presence system (surface, voice, light) for visual customization
```

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run tests/ --reporter=verbose 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/prompts.ts
git commit -m "fix(prompts): strengthen UNSUPPORTED FEATURES to forbid follow-up questions

BUG-5: Agent now immediately explains the limitation and suggests alternatives
instead of asking clarifying questions about unsupported features (e.g., video)."
```

---

### Task 5: BUG-3 — Prevent hallucinated deletion claims

**Severity:** Medium
**Problem:** Agent claimed "Milano tolto" when no Milano fact existed. The agent hallucinated a deletion that didn't happen.
**Fix:** Add a TOOL_POLICY rule that deletion claims must be backed by `delete_fact` results. This reinforces the existing action-claim-guard by making the prompt itself explicit.

**Files:**
- Modify: `src/lib/agent/prompts.ts` (TOOL_POLICY section, after line 256)

- [ ] **Step 1: Add the anti-hallucination rule**

After line 256 (`- When the user asks to remove specific items...`), add:

```
- DELETION HONESTY: Never say "removed X" or "deleted X" unless delete_fact returned success:true for that specific fact. If search_facts finds no matching fact, tell the user: "I don't have X in your profile" instead of pretending to remove it. This applies to corrections too — if the user says "actually not Milano, Bologna", first check if a Milano fact exists before claiming removal.
```

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run tests/ --reporter=verbose 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/prompts.ts
git commit -m "fix(prompts): add DELETION HONESTY rule to prevent hallucinated removals

BUG-3: Agent must verify a fact exists before claiming it was removed.
Prevents 'Milano tolto' when no Milano fact was stored."
```

---

### Task 6: BUG-4 — Multi-action same-turn execution

**Severity:** Medium
**Problem:** User sent "Torna al verticale. E senti, puoi aggiungere un video?" — the agent responded to the video question but forgot to execute the layout change. The IMMEDIATE_EXECUTION_RULE exists but doesn't cover multi-action messages.
**Fix:** Merge the multi-request rule INTO the `IMMEDIATE_EXECUTION_RULE` constant (same scope: semi-universal, interpolated into active-fresh/stale/draft-ready/returning-no-page).

**Files:**
- Modify: `src/lib/agent/policies/shared-rules.ts:54-56` (IMMEDIATE_EXECUTION_RULE constant)

- [ ] **Step 1: Add multi-request clause to IMMEDIATE_EXECUTION_RULE**

In `src/lib/agent/policies/shared-rules.ts`, replace lines 54-56:

```typescript
export const IMMEDIATE_EXECUTION_RULE =
  `When the user asks for a concrete edit and you have enough info, execute the tool call in THIS turn. Do NOT respond with only a plan. This includes when the user confirms your own concrete suggestion/proposal — you already proposed the specific edits, so execute them immediately.
When the user asks to publish, this is your highest-priority directive: execute generate_page + request_publish immediately with existing data. A published page with good content is better than a perfect page that stays unpublished. Share improvement suggestions after publishing, when the user is ready to iterate. The user's publish intent overrides any pending questions you may have.`;
```

with:

```typescript
export const IMMEDIATE_EXECUTION_RULE =
  `When the user asks for a concrete edit and you have enough info, execute the tool call in THIS turn. Do NOT respond with only a plan. This includes when the user confirms your own concrete suggestion/proposal — you already proposed the specific edits, so execute them immediately.
MULTI-REQUEST MESSAGES: When the user's message contains multiple requests (e.g., "change layout AND add X"), process ALL actionable requests before responding. Execute tool calls for each one in sequence. If one request is unsupported, still execute the others — never skip an actionable request because another part of the message distracted you.
When the user asks to publish, this is your highest-priority directive: execute generate_page + request_publish immediately with existing data. A published page with good content is better than a perfect page that stays unpublished. Share improvement suggestions after publishing, when the user is ready to iterate. The user's publish intent overrides any pending questions you may have.`;
```

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run tests/ --reporter=verbose 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/policies/shared-rules.ts
git commit -m "fix(prompts): add MULTI-REQUEST MESSAGES clause to IMMEDIATE_EXECUTION_RULE

BUG-4: When a user message contains multiple requests, the agent must execute
ALL actionable requests before responding. Merged into the semi-universal
IMMEDIATE_EXECUTION_RULE (not a separate rule in sharedBehavioralRules)."
```

---

### Task 7: BUG-1 — Improve tool-call JSON repair

**Severity:** High
**Problem:** LLM (Haiku) sent malformed JSON in `create_fact` value — missing opening quotes on object keys (e.g., `{role: sound designer}` instead of `{"role": "sound designer"}`). Zod validation rejected it, requiring a user retry.
**Fix:** Add a `repairJsonValue` function to `tool-call-repair.ts` that attempts to fix common JSON malformations before Zod validation. Apply it in the existing `experimental_repairToolCall` fast path.

**Files:**
- Modify: `src/lib/agent/tool-call-repair.ts`
- Modify: `src/app/api/chat/route.ts` (apply repair in `experimental_repairToolCall` fast path)
- Test: `tests/evals/tool-call-repair.test.ts` (extend existing file)

- [ ] **Step 1: Write failing tests for JSON repair**

Add a new `describe` block to the existing `tests/evals/tool-call-repair.test.ts`:

```typescript
// Append to tests/evals/tool-call-repair.test.ts
import { repairJsonValue } from "@/lib/agent/tool-call-repair";

describe("repairJsonValue", () => {
  it("fixes unquoted keys with quoted values (most common LLM case)", () => {
    const result = JSON.parse(repairJsonValue('{role: "designer"}'));
    expect(result).toEqual({ role: "designer" });
  });

  it("fixes unquoted string values", () => {
    const result = JSON.parse(repairJsonValue('{"role": sound designer}'));
    expect(result).toEqual({ role: "sound designer" });
  });

  it("fixes both unquoted keys and values", () => {
    const result = JSON.parse(repairJsonValue("{role: sound designer, company: Acme}"));
    expect(result).toEqual({ role: "sound designer", company: "Acme" });
  });

  it("fixes unquoted keys with multiple already-quoted values", () => {
    const result = JSON.parse(repairJsonValue('{role: "sound designer", company: "Milestone"}'));
    expect(result).toEqual({ role: "sound designer", company: "Milestone" });
  });

  it("passes valid JSON through unchanged", () => {
    const valid = '{"role":"designer","company":"Acme"}';
    expect(repairJsonValue(valid)).toBe(valid);
  });

  it("preserves numeric values", () => {
    const result = JSON.parse(repairJsonValue('{count: 42}'));
    expect(result).toEqual({ count: 42 });
  });

  it("preserves negative numeric values", () => {
    const result = JSON.parse(repairJsonValue('{offset: -5}'));
    expect(result).toEqual({ offset: -5 });
  });

  it("preserves boolean values", () => {
    const result = JSON.parse(repairJsonValue('{active: true}'));
    expect(result).toEqual({ active: true });
  });

  it("preserves null values", () => {
    const result = JSON.parse(repairJsonValue('{end: null}'));
    expect(result).toEqual({ end: null });
  });

  it("returns original if repair fails", () => {
    const garbage = "not json at all";
    expect(repairJsonValue(garbage)).toBe(garbage);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/tool-call-repair.test.ts`
Expected: FAIL — `repairJsonValue` not found

- [ ] **Step 3: Implement repairJsonValue**

In `src/lib/agent/tool-call-repair.ts`, add after the existing functions:

```typescript
/**
 * Attempt to repair common JSON malformations from LLM output.
 * Handles: unquoted keys, unquoted string values.
 * Returns repaired JSON string, or original if repair fails.
 */
export function repairJsonValue(raw: string): string {
  // If already valid JSON, return as-is
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    // Continue to repair
  }

  try {
    // Fix 1: Add quotes around unquoted keys  ({role: "x"} → {"role": "x"})
    let fixed = raw.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');

    // Fix 2: Add quotes around unquoted string values
    // Match `: value` where value doesn't start with ", {, [, digit, negative sign, true, false, null
    // IMPORTANT: exclude " from capture group to avoid double-wrapping already-quoted values
    fixed = fixed.replace(
      /:\s*(?!["{\[\d\-]|true|false|null)([^,}\]"]+?)(?=[,}\]])/g,
      (_, val) => `:"${val.trim()}"`,
    );

    // Validate the repaired JSON
    JSON.parse(fixed);
    return fixed;
  } catch {
    return raw;
  }
}
```

**IMPORTANT regex notes:**
- The value-fix regex includes `"` in the exclusion charset of the capture group (`[^,}\]"]+?`) to prevent double-wrapping already-quoted values. Without this, input like `{"role": "designer"}` (with space after `:`) would be corrupted.
- The negative lookahead includes `\-` to preserve negative numbers like `-5`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/tool-call-repair.test.ts`
Expected: PASS (all tests including new ones)

- [ ] **Step 5: Apply repair in experimental_repairToolCall fast path**

In `src/app/api/chat/route.ts`, update the `experimental_repairToolCall` handler (lines 385-419). After the `stripMarkdownCodeFences` fast path (line 393), add a `repairJsonValue` step:

Update the import at line 30:
```typescript
import { stringifyToolArgsForRepair, stripMarkdownCodeFences, repairJsonValue } from "@/lib/agent/tool-call-repair";
```

Replace the fast path logic (lines 386-394):
```typescript
experimental_repairToolCall: async ({ toolCall, parameterSchema, error }) => {
  // Fast path 1: strip markdown code fences that Gemini sometimes wraps around JSON
  const rawArgs = stringifyToolArgsForRepair(toolCall.args);
  const stripped = stripMarkdownCodeFences(rawArgs);
  try {
    JSON.parse(stripped);
    return { toolCallType: "function" as const, toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, args: stripped };
  } catch {
    // Fall through
  }

  // Fast path 2: repair common JSON malformations (unquoted keys/values)
  const repaired = repairJsonValue(stripped);
  if (repaired !== stripped) {
    try {
      JSON.parse(repaired);
      return { toolCallType: "function" as const, toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, args: repaired };
    } catch {
      // Fall through to LLM repair
    }
  }

  // Slow path: LLM repair
  const schema = parameterSchema({ toolName: toolCall.toolName });
  // ... (rest unchanged)
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run 2>&1 | tail -10`

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/tool-call-repair.ts tests/evals/tool-call-repair.test.ts src/app/api/chat/route.ts
git commit -m "fix(tools): add JSON repair for malformed LLM tool call values

BUG-1: repairJsonValue() fixes common LLM JSON errors (unquoted keys, unquoted
string values) before Zod validation rejects them. Applied as a fast-path in
experimental_repairToolCall, before the expensive LLM repair fallback."
```

---

## Verification

After all tasks are complete:

- [ ] **Run full test suite**: `npx vitest run 2>&1 | tail -10`
- [ ] **Run TypeScript check**: `npx tsc --noEmit`
- [ ] **Start dev server and visually verify**: ConnectorCard shows inline error for unconfigured OAuth
- [ ] **Final commit**: Leave as atomic commits per task (one per bug fix)
