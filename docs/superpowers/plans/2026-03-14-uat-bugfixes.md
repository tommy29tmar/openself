# UAT Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 bugs found during UAT: action bar click interception, re-publish 403, phantom profiles, agent reasoning leak, connector dedup gap.

**Architecture:** Targeted fixes — CSS, auth gate, profile ensure, prompt rules, migration backfill. No new subsystems. Deployment order: Bug 1 → 4 → 2 → 3 → 5.

**Tech Stack:** Next.js App Router, SQLite/Drizzle, Vercel AI SDK, CSS

**Review history:** v2: 4 specialist reviewers, 14 findings fixed. v3: 10 specialist reviewers, 10 additional findings fixed.

---

## Chunk 1: Bug 1 — Action Bar Click Interception (CSS Fix)

### Task 1: Fix pointer-events on theme-reveal

**Files:**
- Modify: `src/app/globals.css:431-456` (theme-reveal blocks) and `~540` (reduced-motion block)
- Test: `tests/evals/theme-reveal-pointer-events.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/evals/theme-reveal-pointer-events.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("theme-reveal CSS", () => {
  const css = readFileSync("src/app/globals.css", "utf-8");

  it("should have pointer-events: none on .theme-reveal", () => {
    const match = css.match(/\.theme-reveal\s*\{([^}]+)\}/);
    expect(match).toBeTruthy();
    expect(match![1]).toContain("pointer-events: none");
  });

  it("should have pointer-events: auto on .theme-reveal.revealed", () => {
    const match = css.match(/\.theme-reveal\.revealed\s*\{([^}]+)\}/);
    expect(match).toBeTruthy();
    expect(match![1]).toContain("pointer-events: auto");
  });

  it("should have pointer-events: auto on .preview-mode .theme-reveal", () => {
    const match = css.match(/\.preview-mode\s+\.theme-reveal\s*\{([^}]+)\}/);
    expect(match).toBeTruthy();
    expect(match![1]).toContain("pointer-events: auto");
  });

  it("should have pointer-events: auto in prefers-reduced-motion block", () => {
    // Reduced-motion users see all sections immediately — must be clickable
    const reducedBlock = css.match(/prefers-reduced-motion[\s\S]*?\.theme-reveal\s*\{([^}]+)\}/);
    expect(reducedBlock).toBeTruthy();
    expect(reducedBlock![1]).toContain("pointer-events: auto");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/theme-reveal-pointer-events.test.ts`
Expected: FAIL — pointer-events not found in CSS blocks

- [ ] **Step 3: Add pointer-events to theme-reveal CSS**

In `src/app/globals.css`, modify these blocks:

```css
/* Line ~431 */
.theme-reveal {
  opacity: 0;
  transform: translateY(var(--os-dna-reveal-distance, var(--reveal-distance, 12px)));
  pointer-events: none;  /* ADD: prevent click interception while invisible */
  transition:
    opacity var(--reveal-duration, 600ms) var(--os-dna-ease, var(--reveal-easing, cubic-bezier(0.16, 1, 0.3, 1))),
    transform var(--reveal-duration, 600ms) var(--os-dna-ease, var(--reveal-easing, cubic-bezier(0.16, 1, 0.3, 1)));
}

/* Line ~439 */
.theme-reveal.revealed {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;  /* ADD: re-enable when visible */
}

/* Line ~445 */
.preview-mode .theme-reveal {
  opacity: 1;
  transform: none;
  pointer-events: auto;  /* ADD: always clickable in builder */
}
```

Also add `pointer-events: auto` to the `prefers-reduced-motion` block (~line 540):
```css
@media (prefers-reduced-motion: reduce) {
  .theme-reveal {
    opacity: 1;
    transform: none;
    transition: none;
    animation: none;
    pointer-events: auto;  /* ADD: required since base rule sets pointer-events: none */
  }
}
```

**Do NOT** add `pointer-events` to `@keyframes reveal-fallback` — it is not an animatable CSS property.

**Edge case:** If the CSS fallback animation fires (1.5s delay) but IntersectionObserver hasn't added `.revealed`, sections become visible but remain `pointer-events: none`. Fix by also adding a JS fallback in the IntersectionObserver setup (`src/components/page/OsPageWrapper.tsx`): after the 2.1s mark, add `.revealed` to all `.theme-reveal:not(.revealed)` elements. This is a belt-and-suspenders approach — in practice, the IntersectionObserver fires reliably, and builder mode uses `.preview-mode` which is always `pointer-events: auto`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/theme-reveal-pointer-events.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests pass

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css tests/evals/theme-reveal-pointer-events.test.ts
git commit -m "fix: add pointer-events to theme-reveal CSS to unblock action bar clicks"
```

---

## Chunk 2: Bug 4 — Agent Reasoning Leak

### Task 2: Add TOOL TRANSPARENCY rule to shared-rules.ts

**Files:**
- Modify: `src/lib/agent/policies/shared-rules.ts`
- Test: `tests/evals/tool-transparency-prompt.test.ts`

Note: Per the project's two-layer prompt architecture (Layer 1 = shared-rules.ts for universal rules), this belongs in `shared-rules.ts`, not `OUTPUT_CONTRACT` in `prompts.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/evals/tool-transparency-prompt.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("shared-rules tool transparency", () => {
  const code = readFileSync("src/lib/agent/policies/shared-rules.ts", "utf-8");

  it("should contain TOOL TRANSPARENCY rule", () => {
    expect(code).toContain("TOOL TRANSPARENCY");
  });

  it("should forbid mentioning tool names in responses", () => {
    expect(code).toMatch(/NEVER\s+mention\s+tool\s+names/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/tool-transparency-prompt.test.ts`
Expected: FAIL — no TOOL TRANSPARENCY block in shared-rules

- [ ] **Step 3: Add TOOL TRANSPARENCY rule**

In `src/lib/agent/policies/shared-rules.ts`, the function `sharedBehavioralRules()` returns a single template literal (backtick string). Insert the following block **INSIDE** the template literal, **before the closing backtick** on line 40. Add a `\n` before the block for proper formatting:

```typescript
// Insert INSIDE the template literal, before the closing backtick:

TOOL TRANSPARENCY:
- NEVER mention tool names (delete_fact, create_fact, batch_facts, set_page_style, generate_page, reorder_sections, etc.) in responses.
- NEVER reference factIds, UUIDs, or internal data identifiers.
- NEVER explain how you store, retrieve, or manage data internally.
- When a tool returns an error, rephrase it conversationally. Example: instead of "delete_fact failed for factId X", say "Non sono riuscito a rimuoverlo, riprova."
- The user should perceive you as a helpful assistant, not a system executing tool calls.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/tool-transparency-prompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/policies/shared-rules.ts tests/evals/tool-transparency-prompt.test.ts
git commit -m "fix: add TOOL TRANSPARENCY rule to shared-rules.ts"
```

### Task 3: Sanitize tool error messages in tools.ts

**Files:**
- Modify: `src/lib/agent/tools.ts` (lines 242, 268, 496, 594, 600, 609, 647, 887)
- Modify: `src/lib/services/kb-service.ts` (lines 139-151)
- Test: `tests/evals/tool-error-sanitization.test.ts`

- [ ] **Step 1: Write test for sanitized error messages**

Create `tests/evals/tool-error-sanitization.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("tool error messages", () => {
  const toolsCode = readFileSync("src/lib/agent/tools.ts", "utf-8");
  const kbCode = readFileSync("src/lib/services/kb-service.ts", "utf-8");
  const toolNames = ["delete_fact", "create_fact", "batch_facts", "set_page_style", "generate_page", "search_facts"];

  it("should not contain raw tool names in message: or hint: fields", () => {
    // Split file into lines and check each message:/hint: line for tool names.
    // This approach handles template literals better than regex capture groups.
    const lines = toolsCode.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("message:") || line.startsWith("hint:")) {
        for (const toolName of toolNames) {
          expect(
            line.includes(toolName),
            `Line ${i + 1} contains "${toolName}": ${line.substring(0, 100)}`
          ).toBe(false);
        }
      }
    }
  });

  it("should not expose factId interpolations in messages", () => {
    expect(toolsCode).not.toMatch(/message:\s*`[^`]*\$\{factId\}/);
  });

  it("should not contain internal path references in kb-service error messages", () => {
    expect(kbCode).not.toMatch(/Fact\s+\w+\/\$\{input\.key\}/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/tool-error-sanitization.test.ts`
Expected: FAIL — current messages contain tool names

- [ ] **Step 3: Sanitize error messages**

In `src/lib/agent/tools.ts`, replace:

**Line 242** (identity change confirmation — preserve retry directive):
```typescript
// FROM: "...retry the same tool call with the same target and value."
// TO:
message: `Changing this identity entry requires confirmation. Explain what will change (old → new value) and ask the user to confirm. When they confirm, retry the same operation.`
```

**Line 268** (identity delete confirmation):
```typescript
// FROM: "Deleting identity/${key} requires confirmation."
// TO:
message: `Deleting this identity entry requires confirmation. Explain what will be removed and ask the user to confirm.`
```

**Line 496** (hint with tool names):
```typescript
// FROM: hint: "To update this fact: (1) delete_fact the existing one, (2) create_fact with the new value."
// TO:
hint: "To update: remove the existing entry first, then add the corrected version."
```

**Lines 594 and 600** (batch_facts identity block — keep self-correction signal):
```typescript
// FROM: `Cannot delete identity fact ${factId} via batch_facts. ALWAYS use delete_fact...`
// TO:
message: `Cannot remove identity information in bulk — use the individual removal tool instead, which supports the required confirmation step.`
```

**Line 609** (duplicate IDs):
```typescript
// TO:
message: "Duplicate items detected in removal list. Each item should appear only once."
```

**Line 647** (confirmation mismatch):
```typescript
// TO:
message: "The items to remove don't match what was confirmed. Please confirm the updated list."
```

**Lines 857, 905** (search_facts hints):
```typescript
// FROM: hint: "Use search_facts to find available facts."
// TO:
hint: "Search for available entries to find the correct one."
```

**Line 887** (ambiguous match):
```typescript
// FROM: `Found ${matching.length} facts matching "${factId}". Present... call delete_fact with the specific UUID.`
// TO:
message: `Found ${matching.length} matching items. Ask the user which one to remove, then try again with the specific item.`
```

**Lines 1251, 1364** (create_fact hints):
```typescript
// FROM: hint: "Ensure facts exist before generating. Use create_fact first."
// TO:
hint: "Ensure the relevant information has been saved before generating the page."
```

In `src/lib/services/kb-service.ts`:

**Lines 139-142:**
```typescript
// TO:
`This experience entry already exists but could not be compared. Remove the existing one first, then add the new one.`
```

**Lines 147-150:**
```typescript
// TO (remove company interpolation to prevent info leak):
`An experience entry with this key already exists. Remove the existing one first, then add the corrected version.`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/tool-error-sanitization.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/tools.ts src/lib/services/kb-service.ts tests/evals/tool-error-sanitization.test.ts
git commit -m "fix: sanitize tool error messages to prevent agent reasoning leaks"
```

---

## Chunk 3: Bug 2 — Re-publish 403 (Email Verification)

### Task 4: Auto-verify email at registration

**Files:**
- Modify: `src/app/api/register/route.ts:146-154` (new user path)
- Modify: `src/app/api/register/route.ts:117-137` (retry path — must also set emailVerified=1)
- Modify: `src/lib/services/auth-service.ts:61-75` (`createUser()` — set emailVerified=1 for `/api/auth/signup` path too)
- Test: `tests/evals/register-email-verified.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/evals/register-email-verified.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("registration email verification", () => {
  it("should set emailVerified=1 in /api/register route", () => {
    const code = readFileSync("src/app/api/register/route.ts", "utf-8");
    expect(code).toMatch(/emailVerified:\s*1/);
  });

  it("should set emailVerified=1 in createUser (auth-service)", () => {
    const code = readFileSync("src/lib/services/auth-service.ts", "utf-8");
    // createUser must set emailVerified: 1, not 0
    expect(code).toMatch(/emailVerified:\s*1/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/register-email-verified.test.ts`
Expected: FAIL — emailVerified is 0 in both files

- [ ] **Step 3: Set emailVerified=1 in all registration paths**

**In `src/app/api/register/route.ts`** (new user path, ~line 146-154):
```typescript
db.insert(users)
  .values({
    id: userId,
    email: email.toLowerCase().trim(),
    passwordHash,
    emailVerified: 1,  // ADD: auto-verify at registration
    createdAt: now,
    updatedAt: now,
  })
  .run();
```

**In `src/app/api/register/route.ts`** (retry path, ~line 117-137):
After `user = existingUser;` (line 130), add:
```typescript
user = existingUser;
// Ensure existing user is verified (may have registered via /api/auth/signup without verifying)
if (existingUser.emailVerified !== 1) {
  sqlite.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(existingUser.id);
}
```

**In `src/lib/services/auth-service.ts`** — TWO changes needed:

1. In the `db.insert(users).values({...})` block (~line 61-70), ADD `emailVerified: 1`:
```typescript
db.insert(users)
  .values({
    id: userId,
    email: normalizedEmail,
    passwordHash,
    emailVerified: 1,  // ADD: auto-verify at registration
    createdAt: now,
    updatedAt: now,
  })
  .run();
```

2. In the return object (~line 75), change `emailVerified: 0` to `emailVerified: 1`:
```typescript
// FROM: emailVerified: 0,
// TO:
emailVerified: 1,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/register-email-verified.test.ts`
Expected: PASS

- [ ] **Step 5: Run auth + publish tests**

Run: `npx vitest run tests/evals/auth && npx vitest run tests/evals/publish`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/app/api/register/route.ts src/lib/services/auth-service.ts tests/evals/register-email-verified.test.ts
git commit -m "fix: auto-verify email at registration to prevent re-publish 403"
```

### Task 5: Backfill existing unverified users + update schema version

**Files:**
- Create: `db/migrations/0039_backfill_email_verified.sql`
- Modify: `src/lib/db/migrate.ts:9` (update EXPECTED_SCHEMA_VERSION)

- [ ] **Step 1: Create migration**

```sql
-- Backfill: set email_verified=1 for existing users who have already published.
-- Also covers users registered via /api/auth/signup who have a username.
UPDATE users SET email_verified = 1
WHERE email_verified = 0
  AND id IN (
    SELECT DISTINCT p.user_id FROM profiles p
    WHERE p.username IS NOT NULL AND p.user_id IS NOT NULL
  );

-- Fallback: also check page table for users who published
-- (covers edge case where profiles.username is NULL but page exists)
UPDATE users SET email_verified = 1
WHERE email_verified = 0
  AND id IN (
    SELECT DISTINCT pr.user_id FROM profiles pr
    JOIN page pg ON pg.profile_id = pr.id
    WHERE pg.status = 'published' AND pr.user_id IS NOT NULL
  );
```

- [ ] **Step 2: Commit**

```bash
git add db/migrations/0039_backfill_email_verified.sql
git commit -m "fix: backfill email_verified=1 for existing published users"
```

---

## Chunk 4: Bug 3 — Phantom Profile (Profile Ensure)

### Task 6: Ensure profile exists before fact writes

**Files:**
- Modify: `src/lib/services/kb-service.ts:163`
- Test: `tests/evals/profile-ensure.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/evals/profile-ensure.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("createFact profile ensure", () => {
  const code = readFileSync("src/lib/services/kb-service.ts", "utf-8");

  it("should ensure profile row exists before fact insert", () => {
    expect(code).toMatch(/INSERT\s+OR\s+IGNORE\s+INTO\s+profiles/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/profile-ensure.test.ts`
Expected: FAIL

- [ ] **Step 3: Add profile ensure before fact insert**

In `src/lib/services/kb-service.ts`, add before `db.insert(facts)` (~line 165):

```typescript
const effectiveProfileId = profileId ?? sessionId;
const sortOrder = getNextSortOrder(sessionId, normalized.canonical);

// Ensure profile row exists to prevent orphaned profileId references.
// Uses INSERT OR IGNORE to handle concurrent writes safely (no TOCTOU race).
// Note: userId is NULL here for anonymous sessions — it will be linked
// when the user registers via /api/register (which calls linkProfileToUser).
// Reuses the `now` variable (already computed on line 162 as new Date().toISOString())
// to maintain ISO 8601 format consistency with the rest of the codebase.
sqlite
  .prepare(
    "INSERT OR IGNORE INTO profiles (id, created_at, updated_at) VALUES (?, ?, ?)"
  )
  .run(effectiveProfileId, now, now);

db.insert(facts)
  .values({
    // ... existing code unchanged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/profile-ensure.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/kb-service.ts tests/evals/profile-ensure.test.ts
git commit -m "fix: ensure profile row exists before fact writes (prevent phantom profiles)"
```

### Task 7: Backfill orphaned facts migration + update schema version

**Files:**
- Create: `db/migrations/0040_backfill_orphaned_profiles.sql`
- Modify: `src/lib/db/migrate.ts:9` (update EXPECTED_SCHEMA_VERSION to 40)

- [ ] **Step 1: Create migration**

```sql
-- Backfill: create profile rows for any profileId in facts/page that
-- doesn't exist in profiles table (fixes phantom profile bug).
INSERT OR IGNORE INTO profiles (id, created_at, updated_at)
SELECT DISTINCT f.profile_id, datetime('now'), datetime('now')
FROM facts f
WHERE f.profile_id IS NOT NULL
  AND f.profile_id NOT IN (SELECT id FROM profiles);

-- Also fix page table orphans
INSERT OR IGNORE INTO profiles (id, created_at, updated_at)
SELECT DISTINCT p.profile_id, datetime('now'), datetime('now')
FROM page p
WHERE p.profile_id IS NOT NULL
  AND p.profile_id NOT IN (SELECT id FROM profiles);
```

- [ ] **Step 2: Update EXPECTED_SCHEMA_VERSION**

In `src/lib/db/migrate.ts`, line 9:
```typescript
// FROM: export const EXPECTED_SCHEMA_VERSION = 38;
// TO:
export const EXPECTED_SCHEMA_VERSION = 40;
```

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0040_backfill_orphaned_profiles.sql src/lib/db/migrate.ts
git commit -m "fix: backfill orphaned profiles + update schema version to 40"
```

---

## Chunk 5: Bug 5 — Connector Dedup (One-Time Backfill)

### Task 8: Add one-time cluster backfill script

**Files:**
- Create: `src/scripts/backfill-clusters.ts` (inside `src/` to get path alias resolution)

Note: The `scripts/` directory is excluded from tsconfig.json. Place the script under `src/scripts/` instead so `@/` path aliases resolve correctly. Follow the same pattern as the existing `consolidate-facts.ts` worker handler.

- [ ] **Step 1: Create backfill script**

Create `src/scripts/backfill-clusters.ts`:

```typescript
/**
 * One-time backfill: retroactively cluster unclustered facts.
 *
 * Run with: npx tsx src/scripts/backfill-clusters.ts
 *
 * Follows the same pattern as src/lib/worker/handlers/consolidate-facts.ts
 * but runs as a standalone one-shot script.
 * Safe to run multiple times (idempotent).
 */
import { tryAssignCluster } from "@/lib/services/fact-cluster-service";
import { sqlite } from "@/lib/db";

// Get all active unclustered facts, grouped by profile for scope resolution
const unclustered = sqlite
  .prepare(
    `SELECT id, session_id, profile_id, category, key, value, source
     FROM facts
     WHERE archived_at IS NULL AND cluster_id IS NULL
     ORDER BY profile_id, category, created_at`
  )
  .all() as Array<{
    id: string;
    session_id: string | null;
    profile_id: string | null;
    category: string;
    key: string;
    value: string;
    source: string;
  }>;

console.log(`Found ${unclustered.length} unclustered facts`);

let clustered = 0;
let skipped = 0;
for (const fact of unclustered) {
  // Skip facts without valid owner or session (cannot cluster)
  if (!fact.profile_id || !fact.session_id) {
    skipped++;
    continue;
  }

  try {
    // Parse value from JSON string to object (SQLite stores as text)
    let parsedValue: Record<string, unknown>;
    try {
      parsedValue = typeof fact.value === "string" ? JSON.parse(fact.value) : {};
    } catch {
      parsedValue = {};
    }

    // Get all session IDs for this profile (cross-session clustering)
    const sessionIds = sqlite
      .prepare("SELECT id FROM sessions WHERE profile_id = ?")
      .all(fact.profile_id)
      .map((r: { id: string }) => r.id);

    const result = tryAssignCluster({
      factId: fact.id,
      factKey: fact.key,
      category: fact.category,
      value: parsedValue,
      source: fact.source,
      ownerKey: fact.profile_id as string,   // safe: null guard above
      sessionId: fact.session_id as string,  // safe: null guard above
      sessionIds: sessionIds.length > 0 ? sessionIds : undefined,
    });
    if (result?.clusterId) {
      clustered++;
      console.log(`  Clustered: ${fact.category}/${fact.key} → ${result.clusterId}`);
    }
  } catch (err) {
    console.warn(`  Failed: ${fact.category}/${fact.key}: ${err}`);
  }
}

console.log(`\nDone: ${clustered} clustered, ${skipped} skipped, ${unclustered.length} total`);
```

- [ ] **Step 2: Run the script to verify it works**

Run: `npx tsx src/scripts/backfill-clusters.ts`
Expected: Output showing number of facts processed and clustered.

- [ ] **Step 3: Commit**

```bash
git add src/scripts/backfill-clusters.ts
git commit -m "fix: add one-time cluster backfill script for connector dedup gap"
```

---

## Final Verification

### Task 9: Run full test suite and verify

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (3430+ tests)

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify all changes committed**

```bash
git status
git log --oneline -8
```
Expected: 8 commits, clean working tree
