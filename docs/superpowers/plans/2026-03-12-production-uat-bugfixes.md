# Production UAT Bugfix Plan — 2026-03-12

> **Status: COMPLETED** — All code fixes implemented, reviewed, and deployed on 2026-03-12. 9 commits, 2910 tests passing, 0 tsc errors.

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 12 bugs + 1 idea from real-user UAT on the deployed openself.dev instance.

**Architecture:** Three-layer fix: (1) Coolify deployment/config fixes, (2) code-level bug fixes, (3) agent prompt refinements. Some bugs are deployment-only (no code change needed), some are code-only, some are both.

**Tech Stack:** Next.js App Router, Vercel AI SDK, SQLite, Docker/Coolify, TypeScript

---

## Bug Inventory

| # | ID | Severity | Category | Summary |
|---|-----|----------|----------|---------|
| 1 | DEPLOY-1 | **CRITICAL** | Deploy | Worker container has NO volume mount → separate empty DB |
| 2 | ~~DEPLOY-2~~ | ~~CRITICAL~~ | Deploy | ~~AI models: web uses haiku for all 3 tiers~~ — **NOT A BUG**: Haiku for all tiers is intentional per user preference |
| 3 | DEPLOY-3 | **CRITICAL** | Deploy | Production 5 commits behind HEAD (missing "Attuale Attuale" fix + memory fixes) |
| 4 | BUG-1 | **HIGH** | Code | OAuth callback redirects to `0.0.0.0:3000` instead of `openself.dev` |
| 5 | BUG-2 | **HIGH** | Code | Translation `z.array()` schema invalid for Anthropic API → all translations fail |
| 6 | BUG-3 | **HIGH** | Code | `sendReasoning: true` leaks thinking/reasoning content to client |
| 7 | BUG-4 | **MEDIUM** | Code | `generate_page` doesn't preserve section order from draft (reorder lost) |
| 8 | BUG-5 | **MEDIUM** | Code | Connector sync idempotency: no job timeout → stuck forever |
| 9 | BUG-6 | **LOW** | UI | Avatar upload/remove buttons invisible (dark text on dark background) |
| 10 | BUG-7 | **LOW** | Code | RSS accepts any URL (e.g. LinkedIn) → fails silently on sync |
| 11 | PROMPT-1 | **HIGH** | Prompt | Agent not proactive when page is sparse (says "A presto" instead of asking) |
| 12 | PROMPT-2 | **MEDIUM** | Prompt | Agent describes publish flow wrong ("banner will appear") |
| 13 | PROMPT-3 | **MEDIUM** | Prompt | Agent says bio is "system-generated" and can't be edited |
| 14 | PROMPT-4 | **MEDIUM** | Prompt | Name change double-confirmation (identityDeleteGate + deleteGate overlap) |
| 15 | IDEA-1 | **LOW** | Feature | Chat persistence + welcome-back message after publish |

## Production State (from DB inspection)

- **DB path**: `/data/openself/db/openself.db` (host) → `/app/db/openself.db` (web container)
- **Worker mount**: NONE — worker has its own ephemeral empty DB. **Root cause of all worker/sync failures.**
- **Facts**: 10 total (2 experience, 1 education, 3 skill, 2 interest, 1 stat, 1 identity)
- **Connectors**: 0 rows — OAuth callbacks redirect to `0.0.0.0:3000`, connector never saved
- **Jobs**: 2 stuck as `queued` (0 attempts) — worker can't see them (separate DB)
- **AI models (web)**: ALL tiers = `anthropic:claude-haiku-4-5-20251001` (weakest model!)
- **AI models (worker)**: fast=`openai:gpt-4o-mini`, standard=`anthropic:claude-sonnet-4-6`, reasoning=`openai:gpt-4o`
- **Source commit**: `9dc9acd` (5 commits behind HEAD `5a70b0e`)
- **Translation errors**: `tools.0.custom.input_schema.type: Input should be 'object'` (Anthropic rejects `z.array()` top-level)

## File Structure

### Files to Modify

| File | Responsibility | Bug |
|------|---------------|-----|
| `src/app/api/auth/github/callback/connector/route.ts` | GitHub OAuth callback | BUG-1 |
| `src/app/api/auth/spotify/callback/connector/route.ts` | Spotify OAuth callback | BUG-1 |
| `src/app/api/auth/strava/callback/connector/route.ts` | Strava OAuth callback | BUG-1 |
| `src/lib/ai/translate.ts` | Translation service | BUG-2 |
| `src/app/api/chat/route.ts` | Chat streaming endpoint | BUG-3 |
| `src/lib/agent/tools.ts:1081-1160` | `generate_page` tool | BUG-4 |
| `src/lib/connectors/idempotency.ts` | Sync idempotency guard | BUG-5 |
| `src/lib/worker/index.ts` | Job processing | BUG-5 |
| `src/components/settings/AvatarSection.tsx` | Avatar upload/remove buttons | BUG-6 |
| `src/app/api/connectors/rss/subscribe/route.ts` | RSS subscribe endpoint | BUG-7 |
| `src/lib/agent/policies/active-fresh.ts` | Active-fresh policy | PROMPT-1, PROMPT-2 |
| `src/lib/agent/policies/active-stale.ts` | Active-stale policy | PROMPT-1, PROMPT-2 |
| `src/lib/agent/prompts.ts:114-118` | TOOL_POLICY publish desc | PROMPT-2 |
| `src/lib/agent/prompts.ts:214` | DATA_MODEL_REFERENCE bio | PROMPT-3 |
| `src/lib/agent/tools.ts:240-284` | Identity/delete gate | PROMPT-4 |
| `src/app/api/connectors/github/sync/route.ts` | GitHub sync trigger | BUG-5 |
| `src/app/api/connectors/spotify/sync/route.ts` | Spotify sync trigger | BUG-5 |
| `src/app/api/connectors/strava/sync/route.ts` | Strava sync trigger | BUG-5 |
| `src/app/api/connectors/rss/sync/route.ts` | RSS sync trigger | BUG-5 |
| `src/app/api/connectors/rss/subscribe/route.ts` | RSS subscribe | BUG-5, BUG-7 |
| `src/lib/db/migrate.ts` | Schema version bump | BUG-5 |
| `src/lib/db/schema.ts` | Jobs table schema (heartbeat_at) | BUG-5 |

### Files to Create

| File | Responsibility |
|------|---------------|
| `src/lib/connectors/redirect-helper.ts` | Shared `buildRedirectUrl()` for OAuth callbacks |
| `tests/evals/oauth-callback-redirect.test.ts` | Redirect URL construction tests |
| `tests/evals/translate-schema.test.ts` | Translation schema validation tests |
| `tests/evals/generate-page-order.test.ts` | Section order preservation tests |
| `tests/evals/sync-idempotency-timeout.test.ts` | Job heartbeat/timeout tests |
| `tests/evals/delete-gate-preconfirm.test.ts` | Identity pre-confirm regression test |
| `db/migrations/0031_job_heartbeat.sql` | heartbeat_at column on jobs |

---

## Chunk 1: Deployment Fixes (no code)

### Task 1: Fix Worker Volume Mount

**Context:** The worker container `y4o0k84wcko0co0c0gcw84ws` has NO volume mount. It creates its own empty SQLite DB, so it never sees jobs, facts, or connectors from the web app. This is the root cause of ALL worker/sync failures.

**Files:** Coolify dashboard only (no code changes)

- [ ] **Step 1: Add volume mount to worker in Coolify**

  In Coolify dashboard (`http://89.167.111.236:8000`):
  1. Navigate to worker resource `y4o0k84wcko0co0c0gcw84ws`
  2. Go to "Storages" or "Persistent Storage" section
  3. Add bind mount: Source = `/data/openself/db` → Destination = `/app/db`
  4. This matches the web app's mount exactly

- [ ] **Step 2: Restart worker container**

  After adding the mount, restart the worker. It should now share the same DB and process the 2 queued jobs.

- [ ] **Step 3: Verify worker processes jobs**

  ```bash
  ssh root@89.167.111.236 "docker logs y4o0k84wcko0co0c0gcw84ws-* --tail 20"
  ```
  Expected: `[worker] Processed 2 job(s)` within 10 seconds of restart.

### Task 2: Fix AI Model Configuration

**Context:** The web app uses `anthropic:claude-haiku-4-5-20251001` for ALL tiers. This is the weakest model — produces poor agent behavior (non-proactive, confused, leaks thinking). The worker uses completely different models.

**Files:** Coolify dashboard only (env vars)

- [ ] **Step 0: Verify Google API key exists on both containers**

  **Prerequisite:** `google:*` models require `GOOGLE_GENERATIVE_AI_API_KEY` to be set. Check both containers:
  ```bash
  ssh root@89.167.111.236 "docker exec cokksgw48goscs8okgk48okw-* env | grep GOOGLE"
  ssh root@89.167.111.236 "docker exec y4o0k84wcko0co0c0gcw84ws-* env | grep GOOGLE"
  ```

  If `GOOGLE_GENERATIVE_AI_API_KEY` is not set on the web container, add it in Coolify before changing models.
  The worker already has it (`AIzaSyDJ9g3-...`); the web container also has it. Confirm both are present before proceeding.

  **If Google key is missing:** Fall back to Anthropic models for fast/reasoning:
  ```
  AI_MODEL_FAST=anthropic:claude-haiku-4-5-20251001
  AI_MODEL_REASONING=anthropic:claude-sonnet-4-6
  ```

- [ ] **Step 1: Update web app environment variables**

  In Coolify, resource `cokksgw48goscs8okgk48okw`, set:
  ```
  AI_MODEL_FAST=google:gemini-2.0-flash
  AI_MODEL_STANDARD=anthropic:claude-sonnet-4-6
  AI_MODEL_REASONING=google:gemini-2.5-pro
  AI_PROVIDER=anthropic
  ```

- [ ] **Step 2: Update worker environment variables**

  In Coolify, resource `y4o0k84wcko0co0c0gcw84ws`, set:
  ```
  AI_MODEL_FAST=google:gemini-2.0-flash
  AI_MODEL_STANDARD=anthropic:claude-sonnet-4-6
  AI_MODEL_REASONING=google:gemini-2.5-pro
  AI_PROVIDER=anthropic
  ```

- [ ] **Step 3: Restart both containers**

### Task 3: [PLACEHOLDER — Deploy Latest Code]

**Context:** Production is behind HEAD. The "Attuale Attuale" fix and other improvements are on `main` but not deployed.

**DO NOT deploy here.** This task is a placeholder. The actual deploy happens in Task 20 (Chunk 10) AFTER all code fixes are implemented, tested, and committed.

For now, only apply the Coolify config changes from Tasks 1 and 2 (volume mount + model env vars).

---

## Chunk 2: OAuth Redirect Fix (BUG-1)

### Task 4: Verify connector callback actually reaches createConnector in production

**Context:** The connectors table has 0 rows. The redirect bug (→ `0.0.0.0:3000`) is confirmed, BUT the callback creates the connector BEFORE redirecting (e.g. GitHub line 52 creates, line 56 redirects). If the table is empty, the callback may be failing BEFORE `createConnector()` — possibly at `resolveAuthenticatedConnectorScope()` (auth check), state cookie validation, or token exchange. The redirect fix is still needed, but we must verify the precondition too.

- [ ] **Step 0: Check production logs for callback errors**

  **NOTE:** The callback early-return branches (`auth_required`, `invalid_state`) redirect without logging, so `docker logs` grep will NOT find them. Instead:

  1. First add temporary logging to the callback routes (console.warn on each early-return)
  2. OR reproduce the flow end-to-end in a browser with dev tools open to see which redirect path fires
  3. OR check the OAuth provider settings directly: verify GitHub/Spotify/Strava OAuth apps have redirect URI = `https://openself.dev/api/auth/{provider}/callback/connector`

  ```bash
  # Check for token exchange errors (these DO log):
  ssh root@89.167.111.236 "docker logs cokksgw48goscs8okgk48okw-* 2>&1 | grep -iE '(connector-oauth|connect_failed|Callback error)' | tail -20"
  ```

  **DECISION GATE — this is a hard prerequisite for Task 4b:**

  If the OAuth provider redirect URIs are misconfigured (pointing to localhost or wrong domain), fix those first. If logs show token exchange errors, the callback fails BEFORE `createConnector()`. In that case:
  - **STOP here.** Do NOT proceed to Task 4b until this is fixed.
  - Check that the connector state cookie (`gh_connector_state`, `sp_connector_state`, `strava_connector_state`) is being set with the correct domain/path and `SameSite` attribute
  - Check that `resolveAuthenticatedConnectorScope()` works with the production auth setup (cookie-based session → correct ownerKey)
  - Fix the auth/state issue first, then continue to Task 4b

  If logs show `connect_failed` errors, the token exchange failed — check API credentials.

  If NO callback errors are found at all, it means the OAuth providers never redirected back to the callback (possibly because the provider's redirect URI config doesn't match the Coolify domain). Check GitHub/Spotify/Strava OAuth app settings to confirm the redirect URI is `https://openself.dev/api/auth/{provider}/callback/connector`.

  **Only proceed to Task 4b once you understand why connectors=0.**

### Task 4b: Create shared redirect helper

**Context:** All 3 OAuth callback routes use `new URL("/path", req.url)` which inherits the Docker-internal origin `0.0.0.0:3000` instead of `openself.dev`. The connect routes correctly use `NEXT_PUBLIC_BASE_URL` but the callbacks don't.

**Files:**
- Create: `src/lib/connectors/redirect-helper.ts`
- Test: `tests/evals/oauth-callback-redirect.test.ts`

- [ ] **Step 1: Write the failing test**

  ```typescript
  // tests/evals/oauth-callback-redirect.test.ts
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

  // We test the logic directly — buildCallbackRedirectUrl uses NEXT_PUBLIC_BASE_URL
  describe("buildCallbackRedirectUrl", () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });
    afterEach(() => {
      process.env = ORIGINAL_ENV;
    });

    it("uses NEXT_PUBLIC_BASE_URL when set", async () => {
      process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
      const { buildCallbackRedirectUrl } = await import(
        "@/lib/connectors/redirect-helper"
      );
      const url = buildCallbackRedirectUrl("/builder?connector=github_connected");
      expect(url.origin).toBe("https://openself.dev");
      expect(url.pathname).toBe("/builder");
      expect(url.searchParams.get("connector")).toBe("github_connected");
    });

    it("falls back to localhost:3000 when env not set", async () => {
      delete process.env.NEXT_PUBLIC_BASE_URL;
      // Re-import to pick up new env
      vi.resetModules();
      const { buildCallbackRedirectUrl } = await import(
        "@/lib/connectors/redirect-helper"
      );
      const url = buildCallbackRedirectUrl("/builder?error=test");
      expect(url.origin).toBe("http://localhost:3000");
    });

    it("never produces 0.0.0.0 in the URL", async () => {
      process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
      const { buildCallbackRedirectUrl } = await import(
        "@/lib/connectors/redirect-helper"
      );
      const url = buildCallbackRedirectUrl("/builder?connector=test");
      expect(url.toString()).not.toContain("0.0.0.0");
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npx vitest run tests/evals/oauth-callback-redirect.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

  ```typescript
  // src/lib/connectors/redirect-helper.ts
  /**
   * Build a redirect URL for OAuth callbacks using NEXT_PUBLIC_BASE_URL.
   *
   * In Docker containers, req.url resolves to the internal binding address
   * (e.g., 0.0.0.0:3000) instead of the public domain. This helper ensures
   * callbacks always redirect to the correct public origin.
   */
  export function buildCallbackRedirectUrl(path: string): URL {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    return new URL(path, base);
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  npx vitest run tests/evals/oauth-callback-redirect.test.ts
  ```
  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/connectors/redirect-helper.ts tests/evals/oauth-callback-redirect.test.ts
  git commit -m "feat: shared redirect helper for OAuth callbacks"
  ```

### Task 5: Fix GitHub callback route

**Files:**
- Modify: `src/app/api/auth/github/callback/connector/route.ts`

- [ ] **Step 1: Replace all `new URL("/...", req.url)` with `buildCallbackRedirectUrl`**

  Replace every `NextResponse.redirect(new URL("...", req.url))` in the file with
  `NextResponse.redirect(buildCallbackRedirectUrl("..."))`.

  Lines affected: 29, 34, 43, 56, 61.

  Add import at top:
  ```typescript
  import { buildCallbackRedirectUrl } from "@/lib/connectors/redirect-helper";
  ```

  Changes:
  ```typescript
  // Line 29: auth required
  return NextResponse.redirect(buildCallbackRedirectUrl("/builder?error=auth_required"));

  // Line 34: oauth not configured
  return NextResponse.redirect(buildCallbackRedirectUrl("/builder?error=oauth_not_configured"));

  // Line 43: invalid state
  return NextResponse.redirect(buildCallbackRedirectUrl("/builder?error=invalid_state"));

  // Line 56: success
  const response = NextResponse.redirect(buildCallbackRedirectUrl("/builder?connector=github_connected"));

  // Line 61: error
  return NextResponse.redirect(buildCallbackRedirectUrl("/builder?error=github_connect_failed"));
  ```

- [ ] **Step 2: Commit**

### Task 6: Fix Spotify callback route

**Files:**
- Modify: `src/app/api/auth/spotify/callback/connector/route.ts`

- [ ] **Step 1: Same pattern as GitHub — replace all `new URL("...", req.url)` with `buildCallbackRedirectUrl`**

  Lines affected: 33-34, 40-41, 51-52, 77-78, 84-85.

- [ ] **Step 2: Commit**

### Task 7: Fix Strava callback route

**Files:**
- Modify: `src/app/api/auth/strava/callback/connector/route.ts`

- [ ] **Step 1: Same pattern — replace all `new URL("...", req.url)`**

  Lines affected: 17-18, 25-26, 35-36, 59-60, 84-85, 91-92.

- [ ] **Step 2: Commit**

- [ ] **Step 3: Run full test suite to ensure no regressions**

  ```bash
  npx vitest run
  ```

- [ ] **Step 4: Commit all 3 callback fixes**

  ```bash
  git add src/app/api/auth/*/callback/connector/route.ts
  git commit -m "fix: OAuth callbacks use NEXT_PUBLIC_BASE_URL instead of req.url"
  ```

---

## Chunk 3: Translation Schema Fix (BUG-2)

### Task 8: Fix Anthropic-incompatible translation schema

**Context:** The Vercel AI SDK's `generateObject()` sends the Zod schema as a tool input schema to the LLM. Anthropic requires tool input schemas to have `type: "object"` at the top level. `TranslationResultSchema = z.array(...)` produces `type: "array"` which Anthropic rejects with `tools.0.custom.input_schema.type: Input should be 'object'`.

**Files:**
- Modify: `src/lib/ai/translate.ts:23-29, 201-207`
- Test: `tests/evals/translate-schema.test.ts`

- [ ] **Step 1: Write the failing test**

  ```typescript
  // tests/evals/translate-schema.test.ts
  import { describe, it, expect } from "vitest";
  import { zodToJsonSchema } from "zod-to-json-schema";

  describe("TranslationResultSchema", () => {
    it("has type 'object' at top level for Anthropic compatibility", async () => {
      // Import the schema — we'll need to export it or test the wrapper
      const { TranslationResultSchema } = await import("@/lib/ai/translate");
      const jsonSchema = zodToJsonSchema(TranslationResultSchema);
      expect(jsonSchema.type).toBe("object");
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npx vitest run tests/evals/translate-schema.test.ts
  ```
  Expected: FAIL — `type` is `"array"`, not `"object"`.

- [ ] **Step 3: Fix the schema — wrap array in object**

  In `src/lib/ai/translate.ts`, change:

  ```typescript
  // OLD (line 23-29):
  const TranslationResultSchema = z.array(
    z.object({
      sectionId: z.string().min(1),
      type: z.string().min(1),
      content: z.record(z.string(), z.unknown()),
    }),
  );
  ```

  To:

  ```typescript
  // NEW:
  export const TranslationResultSchema = z.object({
    sections: z.array(
      z.object({
        sectionId: z.string().min(1),
        type: z.string().min(1),
        content: z.record(z.string(), z.unknown()),
      }),
    ),
  });
  ```

  Then update the result extraction (line 207):

  ```typescript
  // OLD:
  const translated: SectionPayload[] = result.object;
  // NEW:
  const translated: SectionPayload[] = result.object.sections;
  ```

  **Also update existing test mocks** — `tests/evals/translate.test.ts` mocks `generateObject().object` as an array. Update those mocks to return `{ sections: [...] }` instead.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Run full test suite**

- [ ] **Step 6: Commit**

  ```bash
  git add src/lib/ai/translate.ts tests/evals/translate-schema.test.ts
  git commit -m "fix: wrap translation schema in z.object for Anthropic compatibility"
  ```

---

## Chunk 4: Thinking Leak Fix (BUG-3)

### Task 9: Disable sendReasoning in chat route

**Context:** `sendReasoning: true` in `toDataStreamResponse()` streams raw thinking content (`[Devo eliminare prima il nome vecchio...]`) directly to the client. The thinking is useful for server-side logging but should NOT be sent to the user.

**Files:**
- Modify: `src/app/api/chat/route.ts:497`

- [ ] **Step 1: Change `sendReasoning: true` to `sendReasoning: false`**

  ```typescript
  // Line 496-498 — change:
  return result.toDataStreamResponse({
    sendReasoning: false,  // was: true — thinking leaked to client as visible text
    headers: { ...extraHeaders, "X-Request-Id": requestId },
  ```

- [ ] **Step 2: Run tests**

  ```bash
  npx vitest run tests/evals/chat-route*.test.ts
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/chat/route.ts
  git commit -m "fix: disable sendReasoning to prevent thinking content leak to client"
  ```

---

## Chunk 5: Section Order Preservation (BUG-4)

### Task 10: Fix generate_page to preserve section order from draft

**Context:** `reorder_sections` saves order to draft via `upsertDraft`. But when `generate_page` is called afterward, it calls `composeOptimisticPage()` directly which rebuilds sections in the default composer order, LOSING the manual reorder. Meanwhile, `recomposeAfterMutation()` correctly passes `draftMeta` which preserves order. Fix: `generate_page` should also preserve section order from the existing draft.

**Files:**
- Modify: `src/lib/agent/tools.ts:1119-1144`
- Test: `tests/evals/generate-page-order.test.ts`

- [ ] **Step 1: Write the failing test**

  ```typescript
  // tests/evals/generate-page-order.test.ts
  import { describe, it, expect } from "vitest";

  describe("generate_page section order preservation", () => {
    it("preserves section order from existing draft after reorder", () => {
      // Test that the composed config respects draftMeta section ordering
      // We test the projection function directly since it's the core logic
      // The actual integration is tested via the tool
    });
  });
  ```

  (Detailed test TBD based on existing test patterns — the key assertion is that sections come out in draft order, not default composer order.)

- [ ] **Step 2: Refactor generate_page to use projectCanonicalConfig (like recomposeAfterMutation)**

  The existing `recomposeAfterMutation()` already correctly preserves order/locks via `projectCanonicalConfig()` with a `DraftMeta` argument. Instead of duplicating that logic, refactor `generate_page` to build a `DraftMeta` from the current draft and call `projectCanonicalConfig()`.

  In `src/lib/agent/tools.ts`, replace the manual compose+style block (lines 1119-1144) with:

  ```typescript
  // Build DraftMeta for order/lock/style preservation (same pattern as recomposeAfterMutation)
  const draftMeta: DraftMeta | undefined = currentDraft
    ? {
        surface: currentDraft.config.surface,
        voice: currentDraft.config.voice,
        light: currentDraft.config.light,
        style: currentDraft.config.style,
        layoutTemplate: currentDraft.config.layoutTemplate,
        sections: currentDraft.config.sections,
      }
    : undefined;

  let styled = projectCanonicalConfig(
    facts,
    username,
    factLang,
    draftMeta,
    effectiveOwnerKey,
  );
  ```

  This reuses the existing projection path which already handles section order preservation, slot carry-over, and lock metadata — eliminating code duplication and ensuring consistent behavior between `recomposeAfterMutation` and `generate_page`.

  Import `projectCanonicalConfig` and `DraftMeta` at the top of the tools file if not already imported.

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/agent/tools.ts tests/evals/generate-page-order.test.ts
  git commit -m "fix: generate_page preserves section order from existing draft"
  ```

---

## Chunk 6: Connector Sync Idempotency Fix (BUG-5)

### Task 11: Add job timeout to idempotency check

**Context:** `hasPendingJob()` checks for `status IN ('queued', 'running')` but has no timeout. If a job crashes while `running`, it stays stuck forever, blocking all future sync requests.

**Files:**
- Modify: `src/lib/connectors/idempotency.ts:17-23`
- Modify: `src/lib/worker/index.ts` (add stale job cleanup)
- Test: `tests/evals/sync-idempotency-timeout.test.ts`

- [ ] **Step 1: Write the failing test**

  ```typescript
  // tests/evals/sync-idempotency-timeout.test.ts
  import { describe, it, expect, beforeEach } from "vitest";

  describe("hasPendingJob with timeout", () => {
    it("ignores running jobs older than 10 minutes", () => {
      // Insert a 'running' job with updated_at 15 minutes ago
      // hasPendingJob should return false (job is stale)
    });

    it("blocks on running jobs within 10 minutes", () => {
      // Insert a 'running' job with updated_at 2 minutes ago
      // hasPendingJob should return true
    });
  });
  ```

- [ ] **Step 2: Add heartbeat_at column via proper migration**

  Create migration `db/migrations/0031_job_heartbeat.sql` (0030 already exists):
  ```sql
  ALTER TABLE jobs ADD COLUMN heartbeat_at TEXT;
  ```

  Bump `EXPECTED_SCHEMA_VERSION` to 31 in `src/lib/db/migrate.ts` (the single source of truth — `src/worker.ts` imports it).

  Update `src/lib/db/schema.ts` to add `heartbeat_at` to the jobs table definition.

- [ ] **Step 3: Set heartbeat_at at claim time + periodic refresh**

  In `claimJob()` in `src/lib/worker/index.ts`, set `heartbeat_at` when claiming:
  ```typescript
  function claimJob(jobId: string): boolean {
    const now = new Date().toISOString();
    const result = sqlite
      .prepare(
        "UPDATE jobs SET status = 'running', updated_at = ?, heartbeat_at = ? WHERE id = ? AND status = 'queued'",
      )
      .run(now, now, jobId);
    return result.changes === 1;
  }
  ```

  In `executeJob()`, start a heartbeat interval for `connector_sync` jobs:
  ```typescript
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  if (job.jobType === "connector_sync") {
    heartbeatInterval = setInterval(() => {
      sqlite.prepare("UPDATE jobs SET heartbeat_at = ? WHERE id = ?")
        .run(new Date().toISOString(), job.id);
    }, 30_000);
  }
  // In the finally block after handler completes:
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  ```

  **IMPORTANT:** `heartbeat_at` is set at claim time (not after first 30s tick), so a fresh job is never mistaken as stale.

  When job completes/fails, clear heartbeat in the status update.

- [ ] **Step 4: Update idempotency check to use heartbeat**

  In `src/lib/connectors/idempotency.ts`:
  ```typescript
  const STALE_JOB_TIMEOUT_MINUTES = 10; // no heartbeat in 10 min = dead (heartbeat every 30s)

  const PENDING_JOB_SQL = `
    SELECT 1 FROM jobs
    WHERE job_type = 'connector_sync'
      AND json_extract(payload, '$.ownerKey') = ?
      AND (
        status = 'queued'
        OR (status = 'running' AND datetime(COALESCE(heartbeat_at, updated_at)) > datetime('now', '-${STALE_JOB_TIMEOUT_MINUTES} minutes'))
      )
    LIMIT 1
  `;
  ```

- [ ] **Step 5: Add stale job recovery in BOTH worker loop AND request path**

  **Worker loop** — In `processJobs()`, fail stale connector_sync jobs:
  ```typescript
  sqlite.prepare(`
    UPDATE jobs SET status = 'failed', last_error = 'heartbeat timeout', updated_at = ?
    WHERE status = 'running'
      AND job_type = 'connector_sync'
      AND datetime(COALESCE(heartbeat_at, updated_at)) < datetime('now', '-10 minutes')
  `).run(new Date().toISOString());
  ```

  **Request path** — Add a `recoverStaleJobs(ownerKey)` function in `idempotency.ts` that sync routes call BEFORE `hasPendingJob()`:
  ```typescript
  export function recoverStaleConnectorJobs(ownerKey: string): void {
    sqlite.prepare(`
      UPDATE jobs SET status = 'failed', last_error = 'heartbeat timeout', updated_at = ?
      WHERE job_type = 'connector_sync'
        AND json_extract(payload, '$.ownerKey') = ?
        AND status = 'running'
        AND datetime(COALESCE(heartbeat_at, updated_at)) < datetime('now', '-10 minutes')
    `).run(new Date().toISOString(), ownerKey);
  }
  ```

  Each sync route calls `recoverStaleConnectorJobs(ownerKey)` before `hasPendingJob(ownerKey)`. This ensures the stale `running` row is failed before the idempotency check and before `enqueueJob()` hits the dedup index.

  **Step 6: Update ALL sync routes to call recoverStaleConnectorJobs + check enqueueJob return**

  Files to modify:
  - `src/app/api/connectors/github/sync/route.ts`
  - `src/app/api/connectors/spotify/sync/route.ts`
  - `src/app/api/connectors/strava/sync/route.ts`
  - `src/app/api/connectors/rss/sync/route.ts`
  - `src/app/api/connectors/rss/subscribe/route.ts`

  In each route, before `hasPendingJob(ownerKey)`, add:
  ```typescript
  import { recoverStaleConnectorJobs, hasPendingJob } from "@/lib/connectors/idempotency";

  // At the start of the handler:
  recoverStaleConnectorJobs(ownerKey);
  ```

  And after `enqueueJob()`, check the return value:
  ```typescript
  const jobId = enqueueJob("connector_sync", { ownerKey, connectorId });
  if (!jobId) {
    return NextResponse.json(
      { success: false, error: "A sync is already in progress" },
      { status: 409 },
    );
  }
  ```

  This ensures stale `running` rows are cleaned up before the idempotency check, AND that a failed enqueue is properly reported as 409.

  **Also update OAuth callback routes** that enqueue `connector_sync` on first connect:
  - `src/app/api/auth/github/callback/connector/route.ts:54`
  - `src/app/api/auth/spotify/callback/connector/route.ts:72`
  - `src/app/api/auth/strava/callback/connector/route.ts:79`

  Add `recoverStaleConnectorJobs(ownerKey)` before `enqueueJob()` in each callback, and handle `enqueueJob() === null` gracefully (log warning, don't fail the redirect — connector was already created).

  **Test fixture updates required** for this task:
  - `tests/evals/scheduler.test.ts` — jobs table setup needs `heartbeat_at` column
  - `tests/evals/github-connector-api.test.ts` — `enqueueJob` mock must return a string (not void)
  - `tests/evals/github-connector-oauth.test.ts` — same
  - `tests/evals/worker-enqueue.test.ts` — update any jobs table schema expectations
  - Any other test that creates jobs table fixtures manually

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/connectors/idempotency.ts src/lib/worker/index.ts tests/evals/sync-idempotency-timeout.test.ts
  git commit -m "fix: add 10-minute timeout for stuck sync jobs"
  ```

---

## Chunk 7: UI Fix — Avatar Buttons (BUG-6)

### Task 12: Fix avatar button visibility in dark Presence panel

**Context:** AvatarSection buttons use Tailwind's implicit dark text color. In the PresencePanel (dark background `#0e0e10`), buttons are invisible — black text on black.

**Files:**
- Modify: `src/components/settings/AvatarSection.tsx:94-107`

- [ ] **Step 1: Add explicit text color to buttons**

  ```typescript
  // Line 97 — Upload button: add text-[var(--page-fg,#333)]
  className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] text-[var(--page-fg,#e5e5e5)] hover:bg-[var(--page-bg-secondary,#f5f5f5)] transition-colors disabled:opacity-40"

  // Line 104 — Remove button: add text-[var(--page-fg,#e5e5e5)] as base
  className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] text-[var(--page-fg,#e5e5e5)] hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
  ```

  The `var(--page-fg, #e5e5e5)` fallback ensures light text when in the dark PresencePanel context where `--page-fg` isn't set.

  **Note:** Check whether the PresencePanel sets CSS variables on its container. If it does, use those. If not, the fallback `#e5e5e5` (light gray) works on dark backgrounds.

- [ ] **Step 2: Visual verification**

  Run `npm run dev`, open the Presence panel, verify Upload/Remove buttons are readable on the dark background.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/settings/AvatarSection.tsx
  git commit -m "fix: avatar buttons visible on dark Presence panel background"
  ```

---

## Chunk 8: RSS URL Validation (BUG-7)

### Task 13: Add social media URL rejection to RSS subscriber

**Context:** The RSS subscribe endpoint validates URL safety (SSRF) but doesn't check whether the URL actually points to an RSS feed. Social media profile URLs (LinkedIn, Twitter, etc.) pass validation but fail silently on sync.

**Files:**
- Modify: `src/app/api/connectors/rss/subscribe/route.ts` (or `src/lib/connectors/rss/url-validator.ts`)

- [ ] **Step 1: Validate URL is an actual RSS feed at subscribe time**

  A domain blocklist is incomplete — any non-feed URL would still pass. Instead, validate the URL is a real feed during subscribe by attempting a fetch+parse with the existing SSRF-protected pipeline.

  In `src/app/api/connectors/rss/subscribe/route.ts`, after URL validation passes but BEFORE creating the connector:

  ```typescript
  // Attempt to fetch and parse as RSS/Atom to validate it's a real feed.
  // Reuse the existing SSRF-protected fetch and parser.
  import { fetchFeedContent } from "@/lib/connectors/rss/parser";

  try {
    const feedResult = await fetchFeedContent(feedUrl);
    // Accept parsed feeds even with zero items (new/quiet feeds are valid).
    // Only reject if the parser couldn't find any feed metadata (title, link, etc.)
    // — which means the URL returned HTML or non-feed content.
    if (!feedResult.feed) {
      return NextResponse.json(
        { success: false, error: "This URL does not appear to be an RSS or Atom feed. Please check the URL." },
        { status: 400 },
      );
    }
  } catch (error) {
    // Distinguish parse failures from network/transient errors.
    // Only reject 400 for definitive "not a feed" cases.
    if (isParseError(error)) {
      return NextResponse.json(
        { success: false, error: "Could not parse this URL as an RSS or Atom feed. Please check the URL." },
        { status: 400 },
      );
    }
    // Network errors, timeouts, HTTP errors → retriable, don't reject the URL
    return NextResponse.json(
      { success: false, error: "Could not reach this URL right now. The feed may be temporarily unavailable — try again later." },
      { status: 502 },
    );
  }
  ```

  Add a helper to classify errors:
  ```typescript
  function isParseError(error: unknown): boolean {
    const msg = String(error);
    // fast-xml-parser throws parse-related errors with these patterns
    return msg.includes("Invalid XML") || msg.includes("Unexpected token")
      || msg.includes("not a valid") || msg.includes("No feed");
  }
  ```

  **RSS subscribe route ordering:** The current `subscribe/route.ts` resets `syncCursor`/`lastSync`, deletes `connector_items`, and rewrites the connector BEFORE the idempotency check. This is a race condition — move `recoverStaleConnectorJobs()` + `hasPendingJob()` check BEFORE any destructive state mutations. If a sync is already running, return 409 before touching the connector state.

  **Parser refactoring:** The current RSS parser swallows parse errors and returns an empty result. For the subscribe-time validation to work, extract the fetch+parse path into a reusable helper that returns explicit result types: `{ ok: true, feed: Feed }` | `{ ok: false, reason: 'parse_error' | 'network_error', message: string }`. Map `parse_error` → 400, `network_error` → 502.

  **IMPORTANT:** Do NOT reject feeds with zero items — a brand-new or quiet feed is still valid. The check should only fail when the parser can't recognize any feed structure at all (no title, no feed link, parse error). The exact check depends on what `fetchFeedContent` returns — match the same validity criteria used by the sync path.

  Network/HTTP errors (DNS failure, timeout, 5xx) return 502 — the user can retry.
  Parse errors (HTML response, invalid XML) return 400 — the URL is definitively not a feed.

  **NOTE:** If `fetchFeedContent` doesn't exist as a standalone function, extract the fetch+parse logic from the sync code into a reusable function in `src/lib/connectors/rss/parser.ts`.

- [ ] **Step 2: Run tests**

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/connectors/rss/subscribe/route.ts
  git commit -m "fix: reject known non-RSS domains (LinkedIn, Twitter, etc.) in RSS subscriber"
  ```

---

## Chunk 9: Agent Prompt Fixes (PROMPT-1 through PROMPT-4)

### Task 14: Fix sparse profile proactivity (PROMPT-1)

**Context:** When a user returns to a sparse profile (< 10 facts) and says "ciao", the agent responds with "A presto" (goodbye). The `has_sparse_profile` situation and `sparseProfileDirective` exist but the active-fresh/stale policies' greeting instructions override them — telling the agent to be "brief" and "operational" and not ask exploratory questions.

**Files:**
- Modify: `src/lib/agent/policies/active-fresh.ts`
- Modify: `src/lib/agent/policies/active-stale.ts`

- [ ] **Step 1: Add sparse-profile awareness to active-fresh greeting**

  In `src/lib/agent/policies/active-fresh.ts`, after the GREETING section (around line 26), add:

  ```
  - EXCEPTION: If you detect a SPARSE PROFILE directive in your context, override the brief greeting.
    Instead of "What would you like to update?", engage the user: "Hey [name]! Your page is looking good
    so far — I notice we could make it stronger with [missing area]. Want to add some details?"
  - Do NOT say goodbye ("a presto", "bye") when the profile has fewer than 10 facts. Keep the conversation going.
  ```

- [ ] **Step 2: Add the same to active-stale**

  In `src/lib/agent/policies/active-stale.ts`, add similar override to the GREETING section.

- [ ] **Step 3: Strengthen the sparseProfileDirective**

  In `src/lib/agent/policies/situations.ts:219-229`, add:

  ```
  - NEVER respond with a farewell/goodbye when the user greets you (ciao, hi, hello). This is a GREETING, not a farewell.
    Always interpret ambiguous short messages as conversation openers when the profile is sparse.
  ```

- [ ] **Step 4: Commit**

### Task 15: Fix publish flow description (PROMPT-2)

**Context:** The agent tells users "a publish button will appear to confirm" but the actual UI shows "Sign up to publish" in the top-right navbar.

**Files:**
- Modify: `src/lib/agent/prompts.ts:118`
- Modify: `src/lib/agent/policies/first-visit.ts:44`
- Modify: `src/lib/agent/policies/draft-ready.ts:40`
- Modify: `src/lib/agent/policies/active-fresh.ts:39`
- Modify: `src/lib/agent/policies/active-stale.ts:66`

- [ ] **Step 1: Update TOOL_POLICY**

  In `src/lib/agent/prompts.ts:118`, change:
  ```
  // OLD:
  "Use request_publish when the user approves their page and chooses a username. This proposes publishing — the user will see a confirmation button"
  // NEW:
  "Use request_publish when the user approves their page and chooses a username. This marks the draft as ready to publish — the user must then click the 'Publish' button in the preview panel (or 'Sign up to publish' in the top-right if not logged in) to confirm."
  ```

  **NOTE:** `request_publish` marks the draft as `approval_pending` — it does NOT publish directly. The user still needs to click the Publish button. The prompt must reflect this accurately.

- [ ] **Step 2: Update policies**

  In `first-visit.ts:44` and `draft-ready.ts:40`, change:
  ```
  // OLD: "Tell them a publish button will appear to confirm"
  // NEW: "After calling request_publish, a 'Publish' button appears in the preview panel. Tell the user to click it to go live. If they're not logged in, clicking it will open the signup flow."
  ```

  In `active-fresh.ts:39` and `active-stale.ts:66`, change:
  ```
  // OLD: "Page updated and ready to publish — confirm from the button on the right."
  // NEW: "Page updated — click 'Publish' in the preview panel to push your changes live."
  ```

  **NOTE:** The Publish button lives in the preview panel (`SplitView.tsx:472`), NOT in the top-right navbar. The top-right "Sign up to publish" CTA only appears when there are unpublished changes and user is not authenticated. After `request_publish`, the preview panel button is the primary CTA for both auth and non-auth users (non-auth triggers signup on click).

- [ ] **Step 3: Commit**

### Task 16: Fix bio editability description (PROMPT-3)

**Context:** The agent tells users "la bio si genera automaticamente dal sistema, non posso editarla a mano." While architecturally correct (bio IS composed from facts), the phrasing makes the user feel blocked. The agent should explain HOW to change the bio instead of refusing.

**Files:**
- Modify: `src/lib/agent/prompts.ts:214`

- [ ] **Step 1: Reframe the bio instruction**

  Change line 214:
  ```
  // OLD:
  "The bio section is auto-composed from identity facts (name, role, company) and experience facts.
   To change the bio, update the underlying identity facts (role, company, name).
   NEVER try to create or update a 'bio' fact — it does not exist."

  // NEW:
  "The bio section is auto-composed from identity facts (name, role, company), experience facts, and interest facts.
   When the user asks to change their bio, DO NOT refuse or say 'it's system-generated'. Instead:
   1. Ask what they want the bio to include
   2. Create/update the relevant facts (identity role/company, interests, experience)
   3. Call generate_page to rebuild — the bio will incorporate the updated facts
   Frame it positively: 'Let me update your profile info and the bio will refresh automatically.'
   NEVER say 'I can't edit the bio' — always offer the path forward.
   NOTE: skills do NOT affect the bio — only identity, experience, and interests do."
  ```

- [ ] **Step 2: Commit**

### Task 17: Fix double confirmation for name change (PROMPT-4)

**Context:** When changing a name, both `identityDeleteGate` and `deleteGate` can trigger confirmations. The identity gate asks "confirm name change?", then the regular delete gate (for 2nd+ deletes in a turn) may ask again.

**Files:**
- Modify: `src/lib/agent/tools.ts:240-284`

- [ ] **Step 1: Suppress duplicate prompt but preserve deletion bookkeeping**

  The issue is that both `identityDeleteGate` and `deleteGate` can trigger user-facing confirmation prompts. The fix must suppress the duplicate prompt from `deleteGate` when `identityDeleteGate` already handled confirmation, BUT still run the `deleteGate` bookkeeping (incrementing `_deletionCountThisTurn`, consuming pendings).

  **Approach: additive API change with `{ preConfirmed?: boolean }` options bag.**

  In `delete_fact`'s execute function, after `identityDeleteGate` passes (returns null on retry), flag it:

  ```typescript
  const identityAlreadyConfirmed = category === "identity" && !identityGateResult;
  ```

  Then pass it to `deleteGate`:
  ```typescript
  const dResult = deleteGate(category, key, factId, { preConfirmed: identityAlreadyConfirmed });
  ```

  **Change the `deleteGate` signature** (additive — existing callers pass no options and get the old behavior):

  ```typescript
  function deleteGate(
    category: string, key: string, factId: string,
    opts?: { preConfirmed?: boolean }
  ) {
    // Existing pending consumption logic runs regardless
    const existing = pendings.find(p => ...);
    if (existing) {
      pendings.splice(pendings.indexOf(existing), 1);
    }

    if (opts?.preConfirmed) {
      // Identity gate already confirmed — skip creating new pending/prompt,
      // but keep the deferred commit pattern so counter only advances on success
      return {
        allowed: true,
        commit: () => { _deletionCountThisTurn++; },
        consumeOnly: () => { /* consume pending if any, but don't advance counter */ },
      };
    }

    // ... rest of existing confirmation logic (2nd+ delete check, etc.) ...
  }
  ```

  **IMPORTANT:** `_deletionCountThisTurn` must only advance inside `commit()` (called on delete success), not unconditionally. This preserves the existing success-coupled semantics — if the delete fails, the counter stays unchanged and subsequent deletes aren't incorrectly gate-checked.

  **All call sites that must be updated** (pass `{}` for unchanged behavior):
  - `src/lib/agent/tools.ts:279` — `delete_fact` UUID path → pass `{ preConfirmed: identityAlreadyConfirmed }`
  - `src/lib/agent/tools.ts:687` — `batch_facts` delete path → pass `{}` (no change)
  - `src/lib/agent/tools.ts:776` — `delete_fact` category/key single-match path → pass `{ preConfirmed: identityAlreadyConfirmed }`
  - `src/lib/agent/tools.ts:808` — `delete_fact` category/key UUID-match path → pass `{ preConfirmed: identityAlreadyConfirmed }`

  This ensures: (1) no double prompt for identity changes, (2) `_deletionCountThisTurn` still increments, (3) pending state is always consumed, (4) subsequent non-identity deletes are still gate-checked correctly.

  **Add a regression test** that proves: identity delete → confirmIdentity → retry → no second confirmation prompt, AND a subsequent non-identity delete in the same turn still triggers the 2nd+ confirmation gate.

- [ ] **Step 2: Run tests**

  ```bash
  npx vitest run tests/evals/identity-delete*.test.ts tests/evals/delete-gate*.test.ts
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/agent/tools.ts
  git commit -m "fix: skip regular deleteGate for identity-confirmed deletes (no double confirmation)"
  ```

---

## Chunk 10: All Prompt Commits + Final Verification

### Task 18: Commit all prompt changes

- [ ] **Step 1: Stage and commit prompt changes**

  ```bash
  git add src/lib/agent/prompts.ts src/lib/agent/policies/*.ts src/lib/agent/tools.ts
  git commit -m "fix: agent prompt refinements (sparse proactivity, publish flow, bio edit, double confirm)"
  ```

### Task 19: Run full test suite

- [ ] **Step 1: Run all tests**

  ```bash
  npx vitest run
  ```
  Expected: All ~2802 tests pass.

- [ ] **Step 2: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```
  Expected: 0 errors.

### Task 20: Final commit and deploy

- [ ] **Step 1: Create final commit if any stragglers**

- [ ] **Step 2: Deploy to production**

  Deploy both web and worker via Coolify API (same as Task 3).

- [ ] **Step 3: Verify on live site**

  After deploy:
  1. Check "Attuale Attuale" is fixed on https://openself.dev/tommaso-rinversi
  2. Test GitHub/Spotify/Strava connector OAuth flow → should redirect to `openself.dev`, not `0.0.0.0`
  3. Check worker logs show job processing
  4. Test bio edit request → agent should explain the path forward
  5. Check Presence panel avatar buttons are visible

---

## IDEA-1: Chat Persistence After Publish (deferred)

**Not included in this plan** — requires significant architecture discussion:
- Chat messages are session-scoped; new login creates a new session
- Would need cross-session message display or session continuity
- Welcome-back message requires a "return detection" hook in the frontend
- Recommend as a separate brainstorming + design session

---

## Summary

| Chunk | Tasks | Type | Est. LOC Changed |
|-------|-------|------|------------------|
| 1 — Deploy fixes | 1-3 | Config only | 0 |
| 2 — OAuth redirect | 4-7 | Code | ~50 |
| 3 — Translation schema | 8 | Code | ~10 |
| 4 — Thinking leak | 9 | Code | ~1 |
| 5 — Section order | 10 | Code | ~20 |
| 6 — Sync timeout | 11 | Code | ~15 |
| 7 — Avatar buttons | 12 | UI | ~4 |
| 8 — RSS validation | 13 | Code | ~15 |
| 9 — Prompt fixes | 14-17 | Prompt | ~40 |
| 10 — Verify & deploy | 18-20 | Testing | 0 |
