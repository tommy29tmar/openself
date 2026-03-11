# Budget Enforcement Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `LLM_HARD_STOP=false` suspend `checkBudget()` enforcement (the global budget gate used by chat, heartbeat, compaction, summary, and episodic services); add bypass-mode logging so UAT spend is still visible; remove dead env vars and admin API fields.

**Architecture:** Two changes: (1) `checkBudget()` logs exactly one `hard_limit_bypassed` event when `hardStop=false` and a hard limit is crossed (replaces the generic `warning` that currently fires for cost overruns), (2) dead env vars and admin API fields cleaned up. Dead Drizzle schema columns are **kept but annotated** as deprecated to prevent `drizzle-kit generate` drift.

**Current behavior baseline:**
- `hardStop=true` + cost over hard limit → blocks (`allowed: false`), logs `hard_limit` event
- `hardStop=true` + tokens over limit → blocks, logs `hard_limit` event
- `hardStop=false` + cost over hard limit → falls through to warning check at line 191 which fires a generic `warning` event (since cost is also above `dailyCostWarningUsd`). No `hard_limit_bypassed` signal — it looks like a normal warning.
- `hardStop=false` + tokens over limit → **completely silent**, no log, no warning message
- This plan reclassifies both cases to a distinct `hard_limit_bypassed` level, suppressing the generic `warning` when a bypass is active.

**Scope exclusions:**
- `checkOwnerBudget()` in `heartbeat-config-service.ts` is NOT modified. It is effectively inert today — heartbeat cost is always recorded as `0` (see `heartbeat.ts` lines 139, 277), so `checkOwnerBudget` never blocks. When real heartbeat cost tracking is implemented in the future, `hardStop` bypass should be added at that time.
- The `dailyTokenLimit` fallback discrepancy (150K in admin API vs 500K in Drizzle schema default) is out of scope — it's a pre-existing inconsistency unrelated to this cleanup.

**Tech Stack:** TypeScript, Drizzle ORM, Vitest

---

## Summary of changes

| Item | Action | Why |
|---|---|---|
| `checkBudget()` bypass logging | Add `hard_limit_bypassed` log + `warningMessage` (try/catch, best-effort) | When `hardStop=false`, exceeded limits should be visible in logs without risking enforcement |
| `LLM_MONTHLY_COST_LIMIT_USD` env var | **Remove** from `.env`, `.env.example`, docs | Never read by any runtime code |
| `monthlyCostLimitUsd` in admin API | **Remove** from GET/PATCH response | Exposed but never enforced |
| `heartbeatCallLimit` in admin API | **Remove** from GET/PATCH response | Exposed but never enforced |
| Admin API PATCH response | **Use serializer** instead of raw DB row | Prevents deprecated columns from leaking into API responses |
| `monthlyCostLimitUsd` Drizzle column | **Keep, annotate as deprecated** | Prevents `drizzle-kit generate` schema drift |
| `heartbeatCallLimit` Drizzle column | **Keep, annotate as deprecated** | Prevents `drizzle-kit generate` schema drift |
| `warningThresholdsJson` Drizzle column | **Keep, annotate as deprecated** | Prevents `drizzle-kit generate` schema drift |
| `warningCooldownMinutes` Drizzle column | **Keep, annotate as deprecated** | Prevents `drizzle-kit generate` schema drift |

---

## Chunk 1: Fix `checkBudget()` logging when `hardStop=false`

### Task 1: Add bypass-mode logging to `checkBudget()`

**Files:**
- Modify: `src/lib/services/usage-service.ts:151-205`
- Test: `tests/evals/budget-enforcement.test.ts` (create)

**Context:** When `hardStop=false` and usage crosses hard limit thresholds, `checkBudget()` needs to:
1. Return `allowed: true` (never block)
2. Log exactly one `hard_limit_bypassed` event (cost takes priority over tokens)
3. Populate `warningMessage` with bypass indicator
4. Suppress the generic `warning` event that would otherwise fire for cost overruns
5. **Never throw** — bypass logging is best-effort (try/catch around `logEvent`)
6. Set `warningMessage` BEFORE calling `logEvent` — if logEvent throws, the message must still be set to prevent fallthrough to the generic warning branch

- [ ] **Step 1: Write failing tests for bypass-mode logging**

Create `tests/evals/budget-enforcement.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock DB and dependencies before importing
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => []),
          get: vi.fn(() => undefined),
        })),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(() => ({ run: vi.fn() })) })) })),
  },
}));

const mockLogEvent = vi.fn();
vi.mock("@/lib/services/event-service", () => ({
  logEvent: (...args: any[]) => mockLogEvent(...args),
}));

describe("checkBudget with hardStop=false", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    // mockReset clears calls AND restores default (no-op) implementation
    mockLogEvent.mockReset();
    for (const key of [
      "LLM_HARD_STOP",
      "LLM_DAILY_COST_HARD_LIMIT_USD",
      "LLM_DAILY_TOKEN_LIMIT",
      "LLM_DAILY_COST_WARNING_USD",
    ]) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it("returns allowed=true with exactly one bypassed event when cost exceeds hard limit and hardStop=false", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => [{ inputTokens: 100000, outputTokens: 200000, estimatedCostUsd: 5.0 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "false";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";
    process.env.LLM_DAILY_COST_WARNING_USD = "1";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(true);
    expect(result.warningMessage).toContain("$5.00");
    expect(result.warningMessage).toContain("bypassed");
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "budget_warning",
        payload: expect.objectContaining({ level: "hard_limit_bypassed" }),
      }),
    );
  });

  it("returns allowed=true with exactly one bypassed event when tokens exceed limit and hardStop=false", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          // cost below hard limit to isolate the token path
          all: vi.fn(() => [{ inputTokens: 3000000, outputTokens: 0, estimatedCostUsd: 0.5 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "false";
    process.env.LLM_DAILY_TOKEN_LIMIT = "2000000";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";
    process.env.LLM_DAILY_COST_WARNING_USD = "1";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(true);
    expect(result.warningMessage).toContain("bypassed");
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ level: "hard_limit_bypassed" }),
      }),
    );
  });

  it("emits exactly one event when BOTH cost and token limits are exceeded with hardStop=false", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => [{ inputTokens: 3000000, outputTokens: 0, estimatedCostUsd: 5.0 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "false";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";
    process.env.LLM_DAILY_TOKEN_LIMIT = "2000000";
    process.env.LLM_DAILY_COST_WARNING_USD = "1";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(true);
    // Cost takes priority
    expect(result.warningMessage).toContain("cost");
    expect(result.warningMessage).toContain("bypassed");
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          level: "hard_limit_bypassed",
          dailyCostUsd: 5.0,
        }),
      }),
    );
  });

  it("returns allowed=true even if logEvent throws during bypass, and does NOT attempt fallback warning log", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => [{ inputTokens: 100000, outputTokens: 200000, estimatedCostUsd: 5.0 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "false";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";
    process.env.LLM_DAILY_COST_WARNING_USD = "1";

    // Make logEvent throw
    mockLogEvent.mockImplementation(() => { throw new Error("DB write failed"); });

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    // Must still allow — logging failure must not become enforcement
    expect(result.allowed).toBe(true);
    // warningMessage should still be set (set before logEvent call)
    expect(result.warningMessage).toContain("bypassed");
    // logEvent was called once (the bypass attempt that threw) — NOT twice (no fallback warning)
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
  });

  it("returns allowed=false when tokens exceed limit and hardStop=true", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          // tokens over limit, cost below hard limit
          all: vi.fn(() => [{ inputTokens: 3000000, outputTokens: 0, estimatedCostUsd: 0.5 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "true";
    process.env.LLM_DAILY_TOKEN_LIMIT = "2000000";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(false);
    expect(result.warningMessage).toContain("token limit reached");
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ level: "hard_limit", limitTokens: 2000000 }),
      }),
    );
  });

  it("returns allowed=false when cost exceeds hard limit and hardStop=true", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => [{ inputTokens: 100000, outputTokens: 200000, estimatedCostUsd: 5.0 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "true";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(false);
    expect(result.warningMessage).toContain("limit reached");
  });

  it("token bypass suppresses generic cost warning (tokens over + cost between warning and hard limit)", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          // tokens 3M > 2M limit, cost $1.5 above warning ($1) but below hard limit ($2)
          all: vi.fn(() => [{ inputTokens: 3000000, outputTokens: 0, estimatedCostUsd: 1.5 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "false";
    process.env.LLM_DAILY_TOKEN_LIMIT = "2000000";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";
    process.env.LLM_DAILY_COST_WARNING_USD = "1";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(true);
    // Token bypass takes effect — generic cost warning suppressed
    expect(result.warningMessage).toContain("token");
    expect(result.warningMessage).toContain("bypassed");
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ level: "hard_limit_bypassed" }),
      }),
    );
  });

  it("returns allowed=true with normal warning when cost above warning but below hard limit", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => [{ inputTokens: 50000, outputTokens: 10000, estimatedCostUsd: 1.5 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "false";
    process.env.LLM_DAILY_COST_WARNING_USD = "1";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(true);
    expect(result.warningMessage).toContain("warning");
    expect(result.warningMessage).not.toContain("bypassed");
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ level: "warning" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run tests/evals/budget-enforcement.test.ts`
Expected: FAIL — bypass tests fail (no `hard_limit_bypassed` signal yet), logEvent-throws test fails (no try/catch).

- [ ] **Step 3: Implement bypass-mode logging in `checkBudget()`**

In `src/lib/services/usage-service.ts`, replace the `checkBudget` function body (lines 151–205) with:

```typescript
export function checkBudget(): BudgetResult {
  const usage = getTodayUsage();
  const limits = getLimits();

  // --- Determine which hard limits are exceeded ---
  const costExceeded = usage.estimatedCostUsd >= limits.dailyCostHardLimitUsd;
  const tokensExceeded = usage.totalTokens >= limits.dailyTokenLimit;

  // --- Hard stop: block if enabled ---
  if (limits.hardStop) {
    if (costExceeded) {
      logEvent({
        eventType: "budget_warning",
        actor: "system",
        payload: {
          level: "hard_limit",
          dailyCostUsd: usage.estimatedCostUsd,
          limitUsd: limits.dailyCostHardLimitUsd,
        },
      });
      return {
        allowed: false,
        warningMessage: `Daily cost limit reached ($${usage.estimatedCostUsd.toFixed(2)} / $${limits.dailyCostHardLimitUsd.toFixed(2)}). Try again tomorrow.`,
      };
    }
    if (tokensExceeded) {
      logEvent({
        eventType: "budget_warning",
        actor: "system",
        payload: {
          level: "hard_limit",
          totalTokens: usage.totalTokens,
          limitTokens: limits.dailyTokenLimit,
        },
      });
      return {
        allowed: false,
        warningMessage: `Daily token limit reached (${usage.totalTokens.toLocaleString()} / ${limits.dailyTokenLimit.toLocaleString()}). Try again tomorrow.`,
      };
    }
  }

  // --- Bypass mode (hardStop=false): log exactly one event, always allow ---
  // CRITICAL: Set warningMessage BEFORE logEvent — if logEvent throws, the message
  // must already be set to prevent fallthrough to the generic warning branch.
  let warningMessage: string | undefined;
  let bypassed = false;

  if (costExceeded) {
    // Cost bypass takes priority — even if tokens are also exceeded, only one event
    warningMessage = `Daily cost limit bypassed (LLM_HARD_STOP=false): $${usage.estimatedCostUsd.toFixed(2)} / $${limits.dailyCostHardLimitUsd.toFixed(2)}.`;
    bypassed = true;
    try {
      logEvent({
        eventType: "budget_warning",
        actor: "system",
        payload: {
          level: "hard_limit_bypassed",
          dailyCostUsd: usage.estimatedCostUsd,
          limitUsd: limits.dailyCostHardLimitUsd,
        },
      });
    } catch {
      // Best-effort: logging failure must not block requests
    }
  } else if (tokensExceeded) {
    warningMessage = `Daily token limit bypassed (LLM_HARD_STOP=false): ${usage.totalTokens.toLocaleString()} / ${limits.dailyTokenLimit.toLocaleString()}.`;
    bypassed = true;
    try {
      logEvent({
        eventType: "budget_warning",
        actor: "system",
        payload: {
          level: "hard_limit_bypassed",
          totalTokens: usage.totalTokens,
          limitTokens: limits.dailyTokenLimit,
        },
      });
    } catch {
      // Best-effort
    }
  }

  // Warning: daily cost approaching (below hard limit but above warning threshold)
  // Suppressed when a bypass is active — avoid duplicate/misleading logging
  if (!bypassed && usage.estimatedCostUsd >= limits.dailyCostWarningUsd) {
    warningMessage = `Daily cost warning: $${usage.estimatedCostUsd.toFixed(2)} of $${limits.dailyCostHardLimitUsd.toFixed(2)} hard limit used.`;
    try {
      logEvent({
        eventType: "budget_warning",
        actor: "system",
        payload: {
          level: "warning",
          dailyCostUsd: usage.estimatedCostUsd,
          warningUsd: limits.dailyCostWarningUsd,
        },
      });
    } catch {
      // Best-effort
    }
  }

  return { allowed: true, warningMessage };
}
```

Key design:
- `costExceeded` and `tokensExceeded` computed upfront
- `hardStop=true` branch: same behavior as before (early return with `allowed: false`)
- `hardStop=false` branch: `if/else if` ensures exactly one bypass event. Cost takes priority.
- **`warningMessage` set BEFORE `logEvent`** — if logEvent throws, message is already set and `bypassed=true` prevents fallthrough
- **`bypassed` boolean** gates the generic warning — NOT `!warningMessage` (which would fail if warningMessage wasn't set before a throw)
- **try/catch** around all bypass/warning `logEvent` calls
- **Exactly one `logEvent` call per `checkBudget()` invocation** (or zero if under all thresholds or on throw)

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run tests/evals/budget-enforcement.test.ts`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Run existing budget-related tests for regression**

Run: `npx vitest run tests/evals/uat-round5.test.ts tests/evals/session-compaction.test.ts tests/evals/chat-route-bootstrap.test.ts tests/evals/heartbeat-conformity.test.ts tests/evals/heartbeat-coherence.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/usage-service.ts tests/evals/budget-enforcement.test.ts
git commit -m "fix: log budget warnings even when LLM_HARD_STOP=false (bypass mode)"
```

---

## Chunk 2: Remove dead env vars and admin API fields, annotate schema

### Task 2: Clean up dead budget configuration surface

**Files:**
- Modify: `src/lib/db/schema.ts:374,377-378,380` (annotate 4 columns as deprecated)
- Modify: `src/app/api/admin/limits/route.ts` (remove dead fields, add response serializer)
- Modify: `.env.example:36` (remove `LLM_MONTHLY_COST_LIMIT_USD`)
- Modify: `.env:32` (remove `LLM_MONTHLY_COST_LIMIT_USD`)
- Test: `tests/evals/budget-enforcement.test.ts` (add structural tests)

**Context:** These fields exist in the Drizzle schema and/or admin API but are never read by any business logic. Schema columns are kept in Drizzle (annotated `// @deprecated`) to prevent `drizzle-kit generate` drift. They are removed from the admin API surface since exposing settable fields that have no effect is misleading. The PATCH response currently returns the raw DB row — both GET and PATCH will use a shared serializer.

- [ ] **Step 1: Write structural tests asserting cleanup is complete**

Append to `tests/evals/budget-enforcement.test.ts`:

```typescript
describe("dead code removal — structural", () => {
  it("admin limits route does not expose dead fields", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/app/api/admin/limits/route.ts", "utf-8");
    expect(src).not.toContain("monthlyCostLimitUsd");
    expect(src).not.toContain("heartbeatCallLimit");
  });

  it("admin limits route uses serializeLimits in both GET and PATCH handlers (not just definition)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/app/api/admin/limits/route.ts", "utf-8");
    // Count call sites only — exclude the function definition line
    const callSites = src.match(/[^n]\sserializeLimits\(/g) || [];
    expect(callSites.length).toBeGreaterThanOrEqual(2);
  });

  it("usage-service does not reference LLM_MONTHLY_COST_LIMIT_USD", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/lib/services/usage-service.ts", "utf-8");
    expect(src).not.toContain("LLM_MONTHLY_COST_LIMIT_USD");
    expect(src).not.toContain("monthlyCostLimit");
  });

  it(".env.example does not contain LLM_MONTHLY_COST_LIMIT_USD", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(".env.example", "utf-8");
    expect(src).not.toContain("LLM_MONTHLY_COST_LIMIT_USD");
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run tests/evals/budget-enforcement.test.ts`
Expected: FAIL — dead fields still present in admin route and .env.example, no `serializeLimits` function

- [ ] **Step 3: Annotate dead columns as deprecated in Drizzle schema**

In `src/lib/db/schema.ts`, add `// @deprecated` comments to the 4 dead columns in the `llmLimits` table. Do NOT remove them (prevents drizzle-kit drift):

```typescript
export const llmLimits = sqliteTable("llm_limits", {
  id: text("id").primaryKey().default("main"),
  dailyTokenLimit: integer("daily_token_limit").default(500000),
  monthlyCostLimitUsd: real("monthly_cost_limit_usd").default(25.0), // @deprecated — never enforced
  dailyCostWarningUsd: real("daily_cost_warning_usd").default(1.0),
  dailyCostHardLimitUsd: real("daily_cost_hard_limit_usd").default(2.0),
  warningThresholdsJson: text("warning_thresholds_json").default("[0.5,0.75,0.9,1.0]"), // @deprecated — never read
  heartbeatCallLimit: integer("heartbeat_call_limit").default(3), // @deprecated — never read
  hardStop: integer("hard_stop", { mode: "boolean" }).default(true),
  warningCooldownMinutes: integer("warning_cooldown_minutes").default(60), // @deprecated — never read
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});
```

- [ ] **Step 4: Rewrite admin API with response serializer**

Replace the full content of `src/app/api/admin/limits/route.ts` with:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { llmLimits } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getTodayUsage } from "@/lib/services/usage-service";

function checkAdminAuth(req: Request): boolean {
  const secret = process.env.ADMIN_API_KEY;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Serialize DB row to public API shape (excludes deprecated columns). */
function serializeLimits(row: typeof llmLimits.$inferSelect | undefined) {
  return {
    dailyTokenLimit: row?.dailyTokenLimit ?? 150_000,
    dailyCostWarningUsd: row?.dailyCostWarningUsd ?? 1.0,
    dailyCostHardLimitUsd: row?.dailyCostHardLimitUsd ?? 2.0,
    hardStop: row?.hardStop ?? true,
  };
}

const PATCHABLE_FIELDS = new Set([
  "dailyTokenLimit",
  "dailyCostWarningUsd",
  "dailyCostHardLimitUsd",
  "hardStop",
]);

/** GET /api/admin/limits — read current limits + today's usage */
export async function GET(req: Request) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = db
    .select()
    .from(llmLimits)
    .where(eq(llmLimits.id, "main"))
    .get();

  const limits = serializeLimits(row);
  const usage = getTodayUsage();

  return NextResponse.json({ limits, usage });
}

/** PATCH /api/admin/limits — update limits (partial update) */
export async function PATCH(req: Request) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (PATCHABLE_FIELDS.has(key)) updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  // Upsert: insert default row if it doesn't exist, then update
  db.insert(llmLimits)
    .values({ id: "main" })
    .onConflictDoNothing()
    .run();

  db.update(llmLimits)
    .set({ ...updates, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(llmLimits.id, "main"))
    .run();

  // Return updated state through serializer — never leak deprecated columns
  const row = db
    .select()
    .from(llmLimits)
    .where(eq(llmLimits.id, "main"))
    .get();

  return NextResponse.json({ success: true, limits: serializeLimits(row) });
}
```

- [ ] **Step 5: Remove `LLM_MONTHLY_COST_LIMIT_USD` from env files**

In `.env.example`, remove the line: `LLM_MONTHLY_COST_LIMIT_USD=25`

In `.env`, remove the line: `LLM_MONTHLY_COST_LIMIT_USD=25`

- [ ] **Step 6: Run tests — verify structural tests pass**

Run: `npx vitest run tests/evals/budget-enforcement.test.ts`
Expected: PASS

- [ ] **Step 7: Run full test suite for regression**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts src/app/api/admin/limits/route.ts .env.example tests/evals/budget-enforcement.test.ts
git commit -m "chore: annotate dead schema columns, remove from admin API and env"
```

---

## Chunk 3: Update documentation

### Task 3: Clean up docs referencing removed items

**Files:**
- Modify: `docs/ARCHITECTURE.md` (remove `LLM_MONTHLY_COST_LIMIT_USD` env reference, annotate dead DDL columns)
- Modify: `docs/DEPLOY.md` (remove from env table)
- Modify: `.claude/agents/deploy.md` (remove from env table)

**Note on DDL in ARCHITECTURE.md:** The `CREATE TABLE llm_limits` block documents the **real SQLite schema** (physical columns). Since we are NOT dropping the columns via migration, the DDL stays accurate. We annotate the dead columns with `-- legacy, unused` comments.

- [ ] **Step 1: Remove `LLM_MONTHLY_COST_LIMIT_USD` from `docs/ARCHITECTURE.md` env section**

Search for `LLM_MONTHLY_COST_LIMIT_USD` (line ~3775) and remove that line from the env var listing.

- [ ] **Step 2: Annotate dead DDL columns in `docs/ARCHITECTURE.md`**

Search for the `CREATE TABLE llm_limits` block (lines ~3168-3180). Add `-- legacy, unused` comment to the 4 dead columns:

```sql
    monthly_cost_limit_usd REAL DEFAULT 25.0,              -- legacy, unused
    warning_thresholds_json TEXT DEFAULT '[0.5,0.75,0.9,1.0]', -- legacy, unused
    heartbeat_call_limit INTEGER DEFAULT 3,                 -- legacy, unused
    warning_cooldown_minutes INTEGER DEFAULT 60,            -- legacy, unused
```

- [ ] **Step 3: Remove from `docs/DEPLOY.md`**

Search for `LLM_MONTHLY_COST_LIMIT_USD` (line ~223) and remove that table row.

- [ ] **Step 4: Remove from `.claude/agents/deploy.md`**

Search for `LLM_MONTHLY_COST_LIMIT_USD` (line ~154) and remove that table row.

- [ ] **Step 5: Commit**

```bash
git add docs/ARCHITECTURE.md docs/DEPLOY.md .claude/agents/deploy.md
git commit -m "docs: remove dead LLM_MONTHLY_COST_LIMIT_USD, annotate legacy DDL columns"
```

---

## Post-implementation verification

After all 3 tasks are complete:

1. **Full test suite**: `npx vitest run` — all ~2650 tests must pass
2. **TypeScript check**: `npx tsc --noEmit` — zero errors
3. **Manual verification**: Grep for any remaining references to removed items in runtime code (excluding `src/lib/db/schema.ts` which retains `@deprecated` annotations, and `tests/` which may contain the removed string as a test assertion):
   ```bash
   grep -r "LLM_MONTHLY_COST_LIMIT_USD" src/ --include="*.ts"
   grep -r "monthlyCostLimit" src/app/ src/lib/services/ src/lib/agent/ --include="*.ts"
   grep -r "heartbeatCallLimit" src/app/ src/lib/services/ src/lib/agent/ --include="*.ts"
   ```
   Expected: zero matches
