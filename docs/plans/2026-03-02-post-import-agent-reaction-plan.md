# Post-Import Agent Reaction — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After a LinkedIn ZIP import, the agent auto-reacts with a brief review and targeted questions to fill gaps LinkedIn doesn't cover.

**Architecture:** Situation-based detection. The import route writes a `pending_import_event` flag to session metadata. The chat route consumes the flag atomically (CAS), runs a deterministic gap analyzer, and injects a context block + policy directive into the system prompt. The frontend sends a real auto-trigger message after import success.

**Tech Stack:** TypeScript, SQLite (Drizzle), Vercel AI SDK, Next.js App Router

**Design doc:** `docs/plans/2026-03-02-post-import-agent-reaction-design.md`

---

### Task 1: Import Gap Analyzer — Tests

**Files:**
- Create: `tests/evals/import-gap-analyzer.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { analyzeImportGaps, type ImportGapReport } from "@/lib/connectors/import-gap-analyzer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1",
    category: "experience",
    key: `k-${Math.random().toString(36).slice(2, 8)}`,
    value: {},
    visibility: "public",
    confidence: 1,
    source: "connector",
    sortOrder: null,
    parentFactId: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("analyzeImportGaps", () => {
  it("returns summary with current role from identity fact", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Alice" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Engineer", company: "Acme" } }),
      makeFact({ category: "experience", key: "li-acme-2020", value: { role: "Engineer", company: "Acme", status: "current" } }),
      makeFact({ category: "experience", key: "li-prev-2018", value: { role: "Intern", company: "BigCo", status: "past" } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.summary.currentRole).toContain("Engineer");
    expect(report.summary.currentRole).toContain("Acme");
    expect(report.summary.pastRoles).toBe(1);
  });

  it("returns summary counts for all categories", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Bob" } }),
      makeFact({ category: "education", key: "edu-1", value: { institution: "MIT" } }),
      makeFact({ category: "education", key: "edu-2", value: { institution: "Stanford" } }),
      makeFact({ category: "language", key: "lang-1", value: { language: "English" } }),
      makeFact({ category: "skill", key: "sk-1", value: { name: "TypeScript" } }),
      makeFact({ category: "skill", key: "sk-2", value: { name: "Python" } }),
      makeFact({ category: "skill", key: "sk-3", value: { name: "Go" } }),
      makeFact({ category: "certification", key: "cert-1", value: { name: "AWS" } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.summary.educationCount).toBe(2);
    expect(report.summary.languageCount).toBe(1);
    expect(report.summary.skillCount).toBe(3);
    expect(report.summary.certificationCount).toBe(1);
  });

  it("detects missing interests/hobbies as highest priority gap", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Carol" } }),
      makeFact({ category: "experience", key: "exp-1", value: { role: "Dev", company: "X" } }),
    ];
    const report = analyzeImportGaps(facts);
    const interestGap = report.gaps.find(g => g.type === "no_interests");
    expect(interestGap).toBeDefined();
    expect(interestGap!.priority).toBe(1);
  });

  it("detects missing personal description as gap", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Dave" } }),
    ];
    const report = analyzeImportGaps(facts);
    const descGap = report.gaps.find(g => g.type === "no_personal_description");
    expect(descGap).toBeDefined();
    expect(descGap!.priority).toBe(2);
  });

  it("detects missing social links as gap", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Eve" } }),
    ];
    const report = analyzeImportGaps(facts);
    const socialGap = report.gaps.find(g => g.type === "no_social_links");
    expect(socialGap).toBeDefined();
    expect(socialGap!.priority).toBe(3);
  });

  it("does not flag interests gap if interest/activity facts exist", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Frank" } }),
      makeFact({ category: "interest", key: "int-1", value: { name: "Photography" } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.gaps.find(g => g.type === "no_interests")).toBeUndefined();
  });

  it("does not flag description gap if bio/summary identity fact exists", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Grace" } }),
      makeFact({ category: "identity", key: "summary", value: { summary: "I love building things." } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.gaps.find(g => g.type === "no_personal_description")).toBeUndefined();
  });

  it("does not flag social gap if contact facts with URLs exist", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Hank" } }),
      makeFact({ category: "contact", key: "website", value: { type: "website", value: "https://hank.dev" } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.gaps.find(g => g.type === "no_social_links")).toBeUndefined();
  });

  it("derives current role from experience with status=current when no identity role", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Ivy" } }),
      makeFact({ category: "experience", key: "exp-1", value: { role: "CTO", company: "StartupCo", status: "current" } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.summary.currentRole).toContain("CTO");
    expect(report.summary.currentRole).toContain("StartupCo");
  });

  it("returns empty gaps array when all gaps are filled", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Jack" } }),
      makeFact({ category: "identity", key: "summary", value: { summary: "Builder." } }),
      makeFact({ category: "interest", key: "int-1", value: { name: "Cooking" } }),
      makeFact({ category: "contact", key: "github", value: { type: "website", value: "https://github.com/jack" } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.gaps).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/import-gap-analyzer.test.ts`
Expected: FAIL — module `@/lib/connectors/import-gap-analyzer` does not exist

**Step 3: Commit**

```bash
git add tests/evals/import-gap-analyzer.test.ts
git commit -m "test: add failing tests for import gap analyzer"
```

---

### Task 2: Import Gap Analyzer — Implementation

**Files:**
- Create: `src/lib/connectors/import-gap-analyzer.ts`

**Step 1: Implement the gap analyzer**

This is a deterministic, zero-LLM function. It receives ALL active facts (not just connector-sourced) so gap detection considers pre-existing data (e.g., manually added interests). The summary counts all facts regardless of source — the caller is responsible for deciding what to pass.

```typescript
import type { FactRow } from "@/lib/services/kb-service";

export type ImportSummary = {
  currentRole?: string;
  pastRoles: number;
  educationCount: number;
  languageCount: number;
  skillCount: number;
  certificationCount: number;
};

export type ImportGap = {
  priority: number;
  type: "no_interests" | "no_personal_description" | "no_social_links";
  description: string;
};

export type ImportGapReport = {
  summary: ImportSummary;
  gaps: ImportGap[];
};

export function analyzeImportGaps(facts: FactRow[]): ImportGapReport {
  const summary = buildSummary(facts);
  const gaps = detectGaps(facts);
  return { summary, gaps };
}

function buildSummary(facts: FactRow[]): ImportSummary {
  // Current role: prefer identity/role, fallback to experience with status=current
  let currentRole: string | undefined;

  const identityRole = facts.find(
    (f) => f.category === "identity" && f.key === "role",
  );
  if (identityRole) {
    const v = identityRole.value as Record<string, string>;
    currentRole = v.company ? `${v.role} at ${v.company}` : v.role;
  }

  const experiences = facts.filter((f) => f.category === "experience");

  if (!currentRole) {
    const currentExp = experiences.find(
      (f) => (f.value as Record<string, string>).status === "current",
    );
    if (currentExp) {
      const v = currentExp.value as Record<string, string>;
      currentRole = v.company ? `${v.role} at ${v.company}` : v.role;
    }
  }

  const pastRoles = experiences.filter(
    (f) => (f.value as Record<string, string>).status !== "current",
  ).length;

  return {
    currentRole,
    pastRoles,
    educationCount: facts.filter((f) => f.category === "education").length,
    languageCount: facts.filter((f) => f.category === "language").length,
    skillCount: facts.filter((f) => f.category === "skill").length,
    certificationCount: facts.filter((f) => f.category === "certification").length,
  };
}

function detectGaps(facts: FactRow[]): ImportGap[] {
  const gaps: ImportGap[] = [];

  // Gap 1: No interests/hobbies — LinkedIn never exports these
  const hasInterests = facts.some(
    (f) => f.category === "interest" || f.category === "activity" || f.category === "hobby",
  );
  if (!hasInterests) {
    gaps.push({
      priority: 1,
      type: "no_interests",
      description: "No interests or hobbies found. LinkedIn does not export these — high value to ask.",
    });
  }

  // Gap 2: No personal description — LinkedIn summary may be empty or corporate
  const hasDescription = facts.some(
    (f) => f.category === "identity" && (f.key === "summary" || f.key === "bio" || f.key === "description"),
  );
  if (!hasDescription) {
    gaps.push({
      priority: 2,
      type: "no_personal_description",
      description: "No personal description or bio found. Ask for a personal summary beyond the LinkedIn headline.",
    });
  }

  // Gap 3: No social links — website, GitHub, etc.
  const hasSocialLinks = facts.some(
    (f) => f.category === "contact" && isUrlContact(f),
  );
  if (!hasSocialLinks) {
    gaps.push({
      priority: 3,
      type: "no_social_links",
      description: "No website or social links found. Ask about personal website, GitHub, portfolio, etc.",
    });
  }

  return gaps;
}

function isUrlContact(fact: FactRow): boolean {
  const v = fact.value as Record<string, string>;
  const value = v.value ?? v.url ?? "";
  return value.startsWith("http") || v.type === "website" || v.type === "github";
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/evals/import-gap-analyzer.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/lib/connectors/import-gap-analyzer.ts
git commit -m "feat: add deterministic import gap analyzer"
```

---

### Task 3: `has_recent_import` Situation — Tests

**Files:**
- Create: `tests/evals/journey-import-situation.test.ts`
- Reference: `src/lib/agent/journey.ts` (lines 38-45 for Situation type, lines 245-320 for detectSituations)

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { detectSituations } from "@/lib/agent/journey";
import type { FactRow } from "@/lib/services/kb-service";

function makeFact(overrides: Partial<FactRow> & { category: string; key: string }): FactRow {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1",
    category: overrides.category,
    key: overrides.key,
    value: {},
    source: "connector",
    confidence: 1,
    visibility: "public",
    sortOrder: null,
    parentFactId: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as FactRow;
}

describe("has_recent_import situation", () => {
  it("detects recent connector facts within 30 minutes", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Test" }, source: "connector", createdAt: recent }),
      makeFact({ category: "experience", key: "exp-1", value: { role: "Dev" }, source: "connector", createdAt: recent }),
    ];
    const situations = detectSituations(facts, "owner1", {
      pendingProposalCount: 0,
      openConflicts: [],
    });
    expect(situations).toContain("has_recent_import");
  });

  it("does not flag old connector facts", () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Test" }, source: "connector", createdAt: old }),
    ];
    const situations = detectSituations(facts, "owner1", {
      pendingProposalCount: 0,
      openConflicts: [],
    });
    expect(situations).not.toContain("has_recent_import");
  });

  it("does not flag non-connector facts", () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Test" }, source: "agent", createdAt: recent }),
    ];
    const situations = detectSituations(facts, "owner1", {
      pendingProposalCount: 0,
      openConflicts: [],
    });
    expect(situations).not.toContain("has_recent_import");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/journey-import-situation.test.ts`
Expected: FAIL — `has_recent_import` not in Situation type or not detected

**Step 3: Commit**

```bash
git add tests/evals/journey-import-situation.test.ts
git commit -m "test: add failing tests for has_recent_import situation"
```

---

### Task 4: `has_recent_import` Situation — Implementation

**Files:**
- Modify: `src/lib/agent/journey.ts` (lines 38-45 for type, lines 245-320 for detection)

**Step 1: Add `has_recent_import` to the Situation type**

In `src/lib/agent/journey.ts`, add the new variant to the `Situation` union type (line ~45):

```typescript
export type Situation =
  | "has_pending_proposals"
  | "has_thin_sections"
  | "has_stale_facts"
  | "has_open_conflicts"
  | "has_name"
  | "has_soul"
  | "has_archivable_facts"
  | "has_recent_import";
```

**Step 2: Add detection logic in `detectSituations()`**

Add a new block inside `detectSituations()`, after the `has_soul` check (around line 310). Add a constant for the time window:

```typescript
const RECENT_IMPORT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
```

Detection block (insert before `return situations;`):

```typescript
  // Recent import (connector facts created within last 30 minutes)
  const recentCutoff = new Date(Date.now() - RECENT_IMPORT_WINDOW_MS);
  const recentConnectorFacts = facts.filter(
    (f) => f.source === "connector" && f.createdAt && new Date(f.createdAt) > recentCutoff,
  );
  if (recentConnectorFacts.length > 0) {
    situations.push("has_recent_import");
  }
```

**Step 3: Run tests to verify they pass**

Run: `npx vitest run tests/evals/journey-import-situation.test.ts`
Expected: ALL PASS

**Step 4: Run full journey test suite for regressions**

Run: `npx vitest run tests/evals/journey-state-detection.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/agent/journey.ts
git commit -m "feat: add has_recent_import situation detection"
```

---

### Task 5: `pending_import_event` Flag — Tests

**Files:**
- Create: `tests/evals/import-event-flag.test.ts`
- Reference: `src/lib/services/session-metadata.ts` (getSessionMeta, mergeSessionMeta)

**Step 1: Write the failing tests for the flag lifecycle**

These tests verify the flag write/read/CAS/TTL behavior using session metadata.

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  writeImportEvent,
  consumeImportEvent,
  type ImportEventFlag,
} from "@/lib/connectors/import-event";
import { getSessionMeta, setSessionMeta } from "@/lib/services/session-metadata";

// Helper: create a real session row in DB (setSessionMeta updates existing rows only)
function createTestSession(id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
  db.insert(sessions).values({ id, inviteCode: "test" }).run();
}

describe("import event flag lifecycle", () => {
  const s1 = "test-import-" + randomUUID().slice(0, 8);
  const s2 = "test-import-" + randomUUID().slice(0, 8);
  const s3 = "test-import-" + randomUUID().slice(0, 8);
  const s4 = "test-import-" + randomUUID().slice(0, 8);
  const s5 = "test-import-" + randomUUID().slice(0, 8);

  beforeEach(() => {
    // Create real session rows so setSessionMeta works
    for (const id of [s1, s2, s3, s4, s5]) createTestSession(id);
  });

  it("writeImportEvent sets flag with pending status", () => {
    writeImportEvent(s1, 15);
    const meta = getSessionMeta(s1);
    const flag = meta.pending_import_event as ImportEventFlag;
    expect(flag).toBeDefined();
    expect(flag.status).toBe("pending");
    expect(flag.factsWritten).toBe(15);
    expect(flag.importId).toBeTruthy();
  });

  it("consumeImportEvent transitions pending → processing → consumed", () => {
    writeImportEvent(s2, 10);

    // First consume: pending → processing (returns the flag)
    const flag = consumeImportEvent(s2);
    expect(flag).not.toBeNull();
    expect(flag!.status).toBe("processing");

    // Verify metadata was updated to processing
    const meta = getSessionMeta(s2);
    expect((meta.pending_import_event as ImportEventFlag).status).toBe("processing");
  });

  it("consumeImportEvent returns null if already processing", () => {
    writeImportEvent(s3, 10);
    consumeImportEvent(s3); // pending → processing

    // Second consume attempt: should return null (CAS guard)
    const secondAttempt = consumeImportEvent(s3);
    expect(secondAttempt).toBeNull();
  });

  it("consumeImportEvent returns null if already consumed", () => {
    writeImportEvent(s4, 10);
    consumeImportEvent(s4);
    // Simulate marking as consumed
    const meta = getSessionMeta(s4);
    (meta.pending_import_event as ImportEventFlag).status = "consumed";
    setSessionMeta(s4, meta);

    const attempt = consumeImportEvent(s4);
    expect(attempt).toBeNull();
  });

  it("consumeImportEvent returns null if flag has expired (TTL)", () => {
    writeImportEvent(s5, 10);
    // Manually backdate the timestamp to 25 hours ago
    const meta = getSessionMeta(s5);
    const flag = meta.pending_import_event as ImportEventFlag;
    flag.timestamp = Date.now() - 25 * 60 * 60 * 1000;
    setSessionMeta(s5, meta);

    const attempt = consumeImportEvent(s5);
    expect(attempt).toBeNull();
    // Flag should be deleted
    const metaAfter = getSessionMeta(s5);
    expect(metaAfter.pending_import_event).toBeUndefined();
  });

  it("consumeImportEvent returns null when no flag exists", () => {
    const attempt = consumeImportEvent("nonexistent-session-id");
    expect(attempt).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/import-event-flag.test.ts`
Expected: FAIL — module `@/lib/connectors/import-event` does not exist

**Step 3: Commit**

```bash
git add tests/evals/import-event-flag.test.ts
git commit -m "test: add failing tests for import event flag lifecycle"
```

---

### Task 6: `pending_import_event` Flag — Implementation

**Files:**
- Create: `src/lib/connectors/import-event.ts`
- Modify: `src/app/api/connectors/linkedin-zip/import/route.ts` (line ~54, after report)

**Step 1: Create the import-event module**

```typescript
import { getSessionMeta, setSessionMeta } from "@/lib/services/session-metadata";
import { sqlite } from "@/lib/db";

const FLAG_KEY = "pending_import_event";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type ImportEventFlag = {
  importId: string;
  factsWritten: number;
  timestamp: number;
  status: "pending" | "processing" | "consumed";
};

/**
 * Write a pending import event flag after successful import.
 * Called by the import route.
 */
export function writeImportEvent(sessionId: string, factsWritten: number): void {
  const flag: ImportEventFlag = {
    importId: crypto.randomUUID(),
    factsWritten,
    timestamp: Date.now(),
    status: "pending",
  };
  const meta = getSessionMeta(sessionId);
  meta[FLAG_KEY] = flag;
  setSessionMeta(sessionId, meta);
}

/**
 * Attempt to atomically consume the import event flag.
 * Returns the flag (with status="processing") if successfully claimed,
 * null if already consumed, processing, expired, or absent.
 *
 * True CAS: uses conditional SQL UPDATE with JSON_EXTRACT check on status='pending'.
 * Only the first caller wins — the WHERE clause ensures atomicity at the SQLite level.
 */
export function consumeImportEvent(sessionId: string): ImportEventFlag | null {
  // First, read to check existence and TTL
  const meta = getSessionMeta(sessionId);
  const raw = meta[FLAG_KEY] as ImportEventFlag | undefined;
  if (!raw) return null;

  // TTL check (G3)
  if (Date.now() - raw.timestamp > TTL_MS) {
    delete meta[FLAG_KEY];
    setSessionMeta(sessionId, meta);
    return null;
  }

  if (raw.status !== "pending") return null;

  // Atomic CAS: use json_set to update ONLY the status field (not the entire metadata blob).
  // This avoids overwriting concurrent changes to other metadata fields (e.g., journal).
  // The WHERE clause ensures only one caller transitions pending → processing.
  const result = sqlite.prepare(`
    UPDATE sessions
    SET metadata = json_set(metadata, '$.pending_import_event.status', 'processing')
    WHERE id = ?
    AND json_extract(metadata, '$.pending_import_event.status') = 'pending'
  `).run(sessionId);

  // If changes === 0, another request already consumed the flag (CAS failed)
  if (result.changes === 0) return null;

  raw.status = "processing";
  return raw;
}

/**
 * Mark the flag as consumed after successful LLM response.
 */
export function markImportEventConsumed(sessionId: string): void {
  const meta = getSessionMeta(sessionId);
  const raw = meta[FLAG_KEY] as ImportEventFlag | undefined;
  if (!raw) return;
  raw.status = "consumed";
  meta[FLAG_KEY] = raw;
  setSessionMeta(sessionId, meta);
}

/**
 * Revert the flag to pending after LLM failure (G2).
 */
export function revertImportEvent(sessionId: string): void {
  const meta = getSessionMeta(sessionId);
  const raw = meta[FLAG_KEY] as ImportEventFlag | undefined;
  if (!raw || raw.status !== "processing") return;
  raw.status = "pending";
  meta[FLAG_KEY] = raw;
  setSessionMeta(sessionId, meta);
}
```

**Step 2: Wire into import route**

In `src/app/api/connectors/linkedin-zip/import/route.ts`, after the `importLinkedInZip()` call (line ~54):

Add import at top:
```typescript
import { writeImportEvent } from "@/lib/connectors/import-event";
```

After `const report = await importLinkedInZip(...)` and before `return NextResponse.json(...)`:
```typescript
    // Write pending import event flag for agent reaction
    if (report.factsWritten > 0) {
      writeImportEvent(scope.knowledgePrimaryKey, report.factsWritten);
    }
```

**Step 3: Update existing API test mocks**

In `tests/evals/linkedin-zip-api.test.ts`, the import route is tested with vi.mock.
Add a mock for the new dependency so existing tests don't break:

```typescript
const mockWriteImportEvent = vi.fn();
vi.mock("@/lib/connectors/import-event", () => ({
  writeImportEvent: (...args: unknown[]) => mockWriteImportEvent(...args),
}));
```

Add a test that verifies `writeImportEvent` is called on success:
```typescript
  it("writes import event flag on successful import", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    const file = new File(["fake"], "test.zip", { type: "application/zip" });
    const req = createUploadRequest(file);
    const { POST } = await import("@/app/api/connectors/linkedin-zip/import/route");
    await POST(req as any);
    expect(mockWriteImportEvent).toHaveBeenCalledWith("sess-1", 5);
  });
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/import-event-flag.test.ts tests/evals/linkedin-zip-api.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/lib/connectors/import-event.ts src/app/api/connectors/linkedin-zip/import/route.ts tests/evals/linkedin-zip-api.test.ts
git commit -m "feat: add import event flag with CAS consume and TTL"
```

---

### Task 7: `recentImportDirective` Policy — Tests

**Files:**
- Create: `tests/evals/import-policy.test.ts`
- Reference: `src/lib/agent/policies/situations.ts` for pattern

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { recentImportDirective } from "@/lib/agent/policies/situations";
import type { ImportGapReport } from "@/lib/connectors/import-gap-analyzer";

describe("recentImportDirective", () => {
  it("returns prompt text mentioning current role", () => {
    const report: ImportGapReport = {
      summary: {
        currentRole: "Engineer at Acme",
        pastRoles: 3,
        educationCount: 2,
        languageCount: 1,
        skillCount: 5,
        certificationCount: 0,
      },
      gaps: [
        { priority: 1, type: "no_interests", description: "No interests found." },
      ],
    };
    const directive = recentImportDirective(report);
    expect(directive).toContain("Engineer at Acme");
    expect(directive).toContain("POST-IMPORT");
  });

  it("includes gap descriptions in the context block", () => {
    const report: ImportGapReport = {
      summary: { pastRoles: 1, educationCount: 0, languageCount: 0, skillCount: 0, certificationCount: 0 },
      gaps: [
        { priority: 1, type: "no_interests", description: "No interests found." },
        { priority: 2, type: "no_personal_description", description: "No bio." },
      ],
    };
    const directive = recentImportDirective(report);
    expect(directive).toContain("No interests found.");
    expect(directive).toContain("No bio.");
  });

  it("sanitizes text to max 100 chars per field", () => {
    const longRole = "A".repeat(200);
    const report: ImportGapReport = {
      summary: { currentRole: longRole, pastRoles: 0, educationCount: 0, languageCount: 0, skillCount: 0, certificationCount: 0 },
      gaps: [],
    };
    const directive = recentImportDirective(report);
    // The role in the output should be truncated
    expect(directive).not.toContain(longRole);
  });

  it("includes the import context delimiters for prompt hygiene", () => {
    const report: ImportGapReport = {
      summary: { pastRoles: 0, educationCount: 0, languageCount: 0, skillCount: 0, certificationCount: 0 },
      gaps: [],
    };
    const directive = recentImportDirective(report);
    expect(directive).toContain("--- BEGIN IMPORT CONTEXT ---");
    expect(directive).toContain("--- END IMPORT CONTEXT ---");
  });

  it("includes POST-IMPORT REVIEW MODE policy rules", () => {
    const report: ImportGapReport = {
      summary: { pastRoles: 0, educationCount: 0, languageCount: 0, skillCount: 0, certificationCount: 0 },
      gaps: [],
    };
    const directive = recentImportDirective(report);
    expect(directive).toContain("POST-IMPORT REVIEW MODE");
    expect(directive).toContain("generate");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/import-policy.test.ts`
Expected: FAIL — `recentImportDirective` not exported

**Step 3: Commit**

```bash
git add tests/evals/import-policy.test.ts
git commit -m "test: add failing tests for recentImportDirective policy"
```

---

### Task 8: `recentImportDirective` Policy — Implementation

**Files:**
- Modify: `src/lib/agent/policies/situations.ts` — add `recentImportDirective()`
- Modify: `src/lib/agent/policies/index.ts` — wire into `getSituationDirectives()`

**Step 1: Add `recentImportDirective` to situations.ts**

Add at the end of `src/lib/agent/policies/situations.ts`:

```typescript
import type { ImportGapReport } from "@/lib/connectors/import-gap-analyzer";

/** Sanitize text: strip control chars, cap length (G5). */
function sanitize(text: string, maxLen = 100): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x1f\x7f]/g, "").slice(0, maxLen);
}

export function recentImportDirective(report: ImportGapReport): string {
  const s = report.summary;
  const role = s.currentRole ? sanitize(s.currentRole) : "not specified";

  const contextBlock = [
    "--- BEGIN IMPORT CONTEXT ---",
    "LINKEDIN IMPORT JUST COMPLETED:",
    "The user just imported their LinkedIn profile.",
    "",
    "IMPORTED DATA SUMMARY:",
    `- Current role: ${role}`,
    `- Past experiences: ${s.pastRoles} roles`,
    `- Education: ${s.educationCount} entries`,
    `- Languages: ${s.languageCount}`,
    `- Skills: ${s.skillCount}`,
    `- Certifications: ${s.certificationCount}`,
  ];

  if (report.gaps.length > 0) {
    contextBlock.push("");
    contextBlock.push("GAPS TO EXPLORE (prioritized):");
    for (const gap of report.gaps) {
      contextBlock.push(`${gap.priority}. ${sanitize(gap.description, 200)}`);
    }
  }

  contextBlock.push("--- END IMPORT CONTEXT ---");

  const policy = `POST-IMPORT REVIEW MODE:
The user just imported their LinkedIn profile. Your job is to review the data
and fill the gaps that LinkedIn doesn't cover.

RULES:
- Briefly acknowledge the import (1-2 sentences, mention current role + one distinctive element)
- Ask ONE open-ended question about the top gap
- Do NOT recite numbers, lists, or inventory of imported data
- In subsequent turns, explore remaining gaps one at a time
- If the user asks to generate the page at any point, do it immediately — no resistance
- After 3-5 enrichment questions, propose generating the page
- Keep the tone conversational, not interrogative`;

  return `${contextBlock.join("\n")}\n\n${policy}`;
}
```

**Step 2: Wire into `getSituationDirectives()` in index.ts**

In `src/lib/agent/policies/index.ts`:

Add import:
```typescript
import type { ImportGapReport } from "@/lib/connectors/import-gap-analyzer";
```

Update `SituationContext` type to include import report:
```typescript
export type SituationContext = {
  pendingProposalCount: number;
  pendingProposalSections: string[];
  thinSections: string[];
  staleFacts: string[];
  openConflicts: string[];
  archivableFacts: string[];
  importGapReport?: ImportGapReport;
};
```

Add directive call inside `getSituationDirectives()`, before `if (directives.length === 0) return "";`.

**IMPORTANT:** The directive is gated on `context.importGapReport` being present, NOT on
`situations.includes("has_recent_import")`. Reason: `has_recent_import` is detected from
`createdAt` timestamps (30-min window), but on re-import/upsert, `createdAt` doesn't change
and the situation may not fire. The server-side flag (`consumeImportEvent`) is the authoritative
trigger — if it succeeds, the report is populated and the directive must fire regardless of situation.

```typescript
  if (context.importGapReport) {
    directives.push(recentImportDirective(context.importGapReport));
  }
```

The `has_recent_import` situation is still useful for context (e.g., other policies may want to
check it), but the import directive fires purely on the flag consume, not the situation.

Add import for `recentImportDirective` from `./situations`.

**Step 3: Run tests to verify they pass**

Run: `npx vitest run tests/evals/import-policy.test.ts`
Expected: ALL PASS

**Step 4: Run full policy tests for regressions**

Run: `npx vitest run tests/evals/policy-registry.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/agent/policies/situations.ts src/lib/agent/policies/index.ts
git commit -m "feat: add recentImportDirective policy with prompt hygiene"
```

---

### Task 9: Chat Route — Consume Flag + Inject Context

**Files:**
- Modify: `src/app/api/chat/route.ts` (lines ~135-150 and ~247-256)
- Modify: `src/lib/agent/prompts.ts` (lines ~307-320, build situation context)
- Reference: `src/lib/connectors/import-event.ts` (consume/mark/revert)
- Reference: `src/lib/connectors/import-gap-analyzer.ts` (analyzeImportGaps)

This task wires the flag consume into the chat route and passes the gap report through the bootstrap→prompt pipeline.

**Step 1: Add import event consumption to the chat route**

Add imports at top of `src/app/api/chat/route.ts`:
```typescript
import { consumeImportEvent, markImportEventConsumed, revertImportEvent, type ImportEventFlag } from "@/lib/connectors/import-event";
import { analyzeImportGaps, type ImportGapReport } from "@/lib/connectors/import-gap-analyzer";
```
(`getActiveFacts` is likely already imported from `@/lib/services/kb-service`; check first and add only if missing.)

Also, read metadata from the request body for telemetry (G4). Currently `route.ts:95` reads
`const { messages, language } = body;`. Do NOT destructure `metadata` into a standalone variable
(lint warning for unused binding). Instead, log it inline where needed:

```typescript
  // Log auto-import trigger for telemetry (G4)
  if (body.metadata?.source === "auto_import_trigger") {
    console.info("[chat] auto-import trigger message", { requestId });
  }
```

Place this after the `requestId` declaration (line ~129). The core import-reaction logic is
driven by the server-side flag, not by the metadata field — the log is purely informational.

**IMPORTANT: Placement.** The flag consume MUST go AFTER all quota checks (lines 151-245),
which contain early `return new Response(..., { status: 429 })` paths. If consume ran before quota
and the request hit a 429, the flag would be stuck at "processing" with no revert.

Place the consume block **after quota enforcement** (after line ~245) and **before `assembleContext()`** (line ~247).
The route uses `effectiveScope` (line 113) and `writeSessionId = effectiveScope.knowledgePrimaryKey` (line 121).

```typescript
  // --- Import event: consume flag if pending (after quota checks) ---
  let importGapReport: ImportGapReport | undefined;
  const importFlag: ImportEventFlag | null = consumeImportEvent(writeSessionId);
  if (importFlag) {
    const allFacts = getActiveFacts(writeSessionId, effectiveScope.knowledgeReadKeys);
    importGapReport = analyzeImportGaps(allFacts);
  }
```

Types `ImportGapReport` and `ImportEventFlag` are available via the imports added in Step 1.

**Step 2: Pass the report through to the situation context**

The `importGapReport` must reach `buildSystemPrompt()` via the bootstrap payload's situations + the SituationContext.

Option A (cleanest): Add `importGapReport` to `BootstrapPayload` and populate it in the chat route after consume. Then `buildSystemPrompt()` passes it into `SituationContext`.

In `src/lib/agent/journey.ts`, add to `BootstrapPayload` type:
```typescript
  importGapReport?: ImportGapReport;
```

In the chat route, after gap analysis (still in the same block):
```typescript
  if (importGapReport) {
    bootstrap.importGapReport = importGapReport;
    // Ensure situation is present even if createdAt-based detection missed it (re-import/upsert)
    if (!bootstrap.situations.includes("has_recent_import")) {
      bootstrap.situations.push("has_recent_import");
    }
  }
```

In `src/lib/agent/prompts.ts`, inside `buildSystemPrompt()`, update the `situationContext` construction (line ~318):
```typescript
  const situationContext: SituationContext = {
    pendingProposalCount: bootstrap.pendingProposalCount,
    pendingProposalSections: [],
    thinSections: bootstrap.thinSections,
    staleFacts: bootstrap.staleFacts,
    openConflicts: bootstrap.openConflicts ?? [],
    archivableFacts: bootstrap.archivableFacts ?? [],
    importGapReport: bootstrap.importGapReport,
  };
```

**Step 3: Add error recovery — mark consumed on success, revert on failure**

The stream is returned immediately at `route.ts:377` via `result.toDataStreamResponse()`.
Actual completion happens inside the `onFinish` callback (`route.ts:312`).
The outer `catch` block (`route.ts:385`) only covers pre-stream errors.

Therefore:

**In `onFinish` callback** (inside the `streamText()` options, around `route.ts:312`).
The callback signature is `onFinish: async ({ text, usage, finishReason })`.
`finishReason` values: `"stop"` (normal), `"tool-calls"` (step exhaustion), `"error"`, `"length"`, etc.
Only mark consumed on successful completion; revert on error finishReason:

```typescript
        // Import event: mark consumed on success, revert on error (G2)
        if (importFlag) {
          try {
            if (finishReason === "error") {
              revertImportEvent(writeSessionId);
            } else {
              markImportEventConsumed(writeSessionId);
            }
          } catch { /* best-effort */ }
        }
```

**In `getErrorMessage` callback** (inside `toDataStreamResponse`, around `route.ts:379`), add before `return`:
```typescript
        // Revert import event flag on stream error (G2)
        if (importFlag) {
          try { revertImportEvent(writeSessionId); } catch { /* best-effort */ }
        }
```

**In the outer `catch` block** (`route.ts:385`), also add revert for pre-stream errors:
```typescript
    // Revert import event flag on pre-stream error (G2)
    if (importFlag) {
      try { revertImportEvent(writeSessionId); } catch { /* best-effort */ }
    }
```

Note: `importFlag` is declared with `const` in Step 1 (after quota checks, before the `try` block
at line ~279), so it's in scope for `onFinish`, `getErrorMessage`, and the outer `catch`.

**Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/app/api/chat/route.ts src/lib/agent/prompts.ts src/lib/agent/journey.ts
git commit -m "feat: consume import event flag in chat route with error recovery"
```

---

### Task 10: Frontend Auto-Trigger Message

**Architecture problem:** `append()` from `useChat` lives inside `ChatPanelInner` (`ChatPanel.tsx:534`).
`ConnectorSection` is rendered by `SettingsPanel` (`SettingsPanel.tsx:242`), which is rendered by
`SplitView` (`SplitView.tsx:393`). There is no shared React context or prop chain between them.

**Solution:** Use a custom DOM event as a lightweight bridge. `ConnectorSection` dispatches an event,
`ChatPanelInner` listens for it and calls `append()` — no prop drilling through 3 layers.

**Files:**
- Modify: `src/components/settings/ConnectorSection.tsx` (LinkedInCard success handler, line ~238)
- Modify: `src/components/chat/ChatPanel.tsx` (ChatPanelInner, add event listener)

**Step 1: Dispatch custom event from ConnectorSection**

In `src/components/settings/ConnectorSection.tsx`, in the `LinkedInCard` success branch (line ~238):

```typescript
      if (res.success && res.report) {
        setResult({ factsWritten: res.report.factsWritten });
        onRefresh();
        // Dispatch event for ChatPanel to pick up (G4)
        if (res.report.factsWritten > 0) {
          window.dispatchEvent(
            new CustomEvent("openself:import-complete", {
              detail: { factsWritten: res.report.factsWritten },
            }),
          );
        }
      }
```

**Step 2: Listen in ChatPanelInner and call append()**

In `src/components/chat/ChatPanel.tsx`, inside `ChatPanelInner`.

The existing `useChat` destructuring at line ~534 is:
```typescript
  const { messages, input, handleInputChange, handleSubmit, isLoading, reload, setMessages } =
    useChat({ ... });
```

**Add `append` to the destructuring:**
```typescript
  const { messages, input, handleInputChange, handleSubmit, isLoading, reload, setMessages, append } =
    useChat({ ... });
```

Then add a `useEffect` after the destructuring:

```typescript
  // Auto-trigger message after LinkedIn import (G4)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.factsWritten) return;
      // append() from useChat sends a real user message to /api/chat
      append(
        { role: "user", content: "Ho importato il mio profilo LinkedIn" },
        { body: { language, metadata: { source: "auto_import_trigger" } } },
      );
    };
    window.addEventListener("openself:import-complete", handler);
    return () => window.removeEventListener("openself:import-complete", handler);
  }, [append, language]);
```

The `body` option in `append()` merges with the default `body` from `useChat` (which already sends `language`),
so `metadata` will be included in the POST to `/api/chat`.

**Step 3: Verify `useChat` append body merge**

Check Vercel AI SDK docs: `append(message, options)` where `options.body` is merged with the
`useChat` default body. The chat route receives `body.metadata` alongside `body.messages` and
`body.language`. Verify this works by checking the SDK source or testing locally.

**Step 4: Test manually**

1. Open the builder
2. Import a LinkedIn ZIP
3. Verify the chat receives "Ho importato il mio profilo LinkedIn" as a user message
4. Verify the agent responds with import acknowledgment + first gap question
5. Verify the message is visible in chat history (not hidden)

**Step 5: Commit**

```bash
git add src/components/settings/ConnectorSection.tsx src/components/chat/ChatPanel.tsx
git commit -m "feat: send auto-trigger message after LinkedIn import via DOM event bridge"
```

---

### Task 11: Pipeline Smoke Test

This is a **unit-level pipeline test** that verifies the individual functions compose correctly
(gap analyzer + situation detection + policy directive generation + flag lifecycle).
It does NOT test the actual `/api/chat` HTTP route or prompt injection into `streamText()` —
that is covered by manual E2E testing in Task 12.

**Files:**
- Create: `tests/evals/import-reaction-pipeline.test.ts`

**Step 1: Write pipeline test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { writeImportEvent, consumeImportEvent, markImportEventConsumed, revertImportEvent } from "@/lib/connectors/import-event";
import { analyzeImportGaps } from "@/lib/connectors/import-gap-analyzer";
import { detectSituations } from "@/lib/agent/journey";
import { getSituationDirectives } from "@/lib/agent/policies";

function createTestSession(id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
  db.insert(sessions).values({ id, inviteCode: "test" }).run();
}

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1",
    category: "experience",
    key: `k-${Math.random().toString(36).slice(2, 8)}`,
    value: {},
    source: "connector",
    confidence: 1,
    visibility: "public",
    sortOrder: null,
    parentFactId: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("import reaction pipeline (unit-level)", () => {
  const s1 = "test-pipeline-" + randomUUID().slice(0, 8);
  const s2 = "test-pipeline-" + randomUUID().slice(0, 8);

  beforeEach(() => {
    createTestSession(s1);
    createTestSession(s2);
  });

  it("full pipeline: write flag → detect situation → consume → analyze → directive", () => {
    // 1. Write flag (simulates import route)
    writeImportEvent(s1, 15);

    // 2. Create in-memory facts (simulates imported data)
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Marco" } }),
      makeFact({ category: "experience", key: "exp-1", value: { role: "CTO", company: "Startup", status: "current" } }),
      makeFact({ category: "education", key: "edu-1", value: { institution: "MIT" } }),
      makeFact({ category: "skill", key: "sk-1", value: { name: "TypeScript" } }),
    ];

    // 3. Detect situations (in-memory, no DB dependency for this check)
    const situations = detectSituations(facts as any, "owner1", {
      pendingProposalCount: 0,
      openConflicts: [],
    });
    expect(situations).toContain("has_recent_import");

    // 4. Consume flag (DB-backed)
    const flag = consumeImportEvent(s1);
    expect(flag).not.toBeNull();
    expect(flag!.status).toBe("processing");

    // 5. Analyze gaps (pure function, no DB)
    const report = analyzeImportGaps(facts as any);
    expect(report.gaps.length).toBeGreaterThan(0);
    expect(report.summary.currentRole).toContain("CTO");

    // 6. Generate directive (pure function)
    const directive = getSituationDirectives(situations, {
      pendingProposalCount: 0,
      pendingProposalSections: [],
      thinSections: [],
      staleFacts: [],
      openConflicts: [],
      archivableFacts: [],
      importGapReport: report,
    });
    expect(directive).toContain("POST-IMPORT");
    expect(directive).toContain("CTO");

    // 7. Mark consumed (DB-backed)
    markImportEventConsumed(s1);

    // 8. Second consume should fail (idempotency)
    const second = consumeImportEvent(s1);
    expect(second).toBeNull();
  });

  it("error recovery: revert on failure, re-consume on retry", () => {
    writeImportEvent(s2, 10);

    // First consume
    const flag1 = consumeImportEvent(s2);
    expect(flag1).not.toBeNull();

    // Simulate LLM failure → revert
    revertImportEvent(s2);

    // Re-consume should work
    const flag2 = consumeImportEvent(s2);
    expect(flag2).not.toBeNull();
    expect(flag2!.importId).toBe(flag1!.importId);
  });
});
```

**Step 2: Run the pipeline test**

Run: `npx vitest run tests/evals/import-reaction-pipeline.test.ts`
Expected: ALL PASS

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add tests/evals/import-reaction-pipeline.test.ts
git commit -m "test: add import reaction pipeline smoke test"
```

---

### Task 11b: Route-Level Test (Chat Route Import Flag Wiring)

This task tests the actual `POST /api/chat` route handler with mocked dependencies,
following the pattern established by `tests/evals/chat-route-bootstrap.test.ts`.
It verifies that the route consumes the flag, populates `bootstrap.importGapReport`,
passes it to `assembleContext`, and reverts on error.

**Files:**
- Create: `tests/evals/chat-route-import-flag.test.ts`
- Reference: `tests/evals/chat-route-bootstrap.test.ts` for the mock structure

**Step 1: Write the route-level test**

```typescript
/**
 * Tests that POST /api/chat consumes the import event flag and wires
 * importGapReport through to assembleContext's bootstrap payload.
 *
 * Follows the same mock structure as chat-route-bootstrap.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (hoisted, matching real route.ts imports) ---

const mockBootstrapPayload = {
  journeyState: "first_visit" as const,
  situations: [] as string[],
  expertiseLevel: "novice" as const,
  userName: null,
  lastSeenDaysAgo: null,
  publishedUsername: null,
  pendingProposalCount: 0,
  thinSections: [] as string[],
  staleFacts: [] as string[],
  openConflicts: [] as string[],
  archivableFacts: [],
  language: "en",
  conversationContext: null,
  archetype: "generalist" as const,
};

vi.mock("@/lib/agent/journey", () => ({
  assembleBootstrapPayload: vi.fn(() => ({
    payload: { ...mockBootstrapPayload },
    data: { facts: [], soul: null, openConflictRecords: [], publishableFacts: [] },
  })),
}));

vi.mock("@/lib/agent/context", () => ({
  assembleContext: vi.fn(() => ({
    systemPrompt: "test prompt",
    trimmedMessages: [{ role: "user", content: "hello" }],
    mode: "onboarding",
  })),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: vi.fn(() => ({
    cognitiveOwnerKey: "cog-1",
    knowledgeReadKeys: ["sess-a"],
    knowledgePrimaryKey: "sess-a",
    currentSessionId: "sess-a",
  })),
  getAuthContext: vi.fn(() => null),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: vi.fn(() => false),
  tryIncrementMessageCount: vi.fn(() => true),
  getMessageLimit: vi.fn(() => 50),
  getMessageCount: vi.fn(() => 0),
  DEFAULT_SESSION_ID: "__default__",
}));

vi.mock("@/lib/services/usage-service", () => ({
  checkBudget: vi.fn(() => ({ allowed: true })),
  recordUsage: vi.fn(),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/ai/provider", () => ({
  getModel: vi.fn(() => "mock-model"),
  getModelForTier: vi.fn(() => "mock-model"),
  getProviderName: vi.fn(() => "anthropic"),
  getModelId: vi.fn(() => "mock-model-id"),
  getModelIdForTier: vi.fn(() => "mock-model-id"),
}));

vi.mock("ai", () => ({
  streamText: vi.fn(() => ({
    toDataStreamResponse: vi.fn(() => new Response("ok")),
  })),
  generateText: vi.fn(() => ({ text: "" })),
}));

vi.mock("@/lib/agent/tools", () => ({
  createAgentTools: vi.fn(() => ({ tools: {}, getJournal: () => [] })),
}));

vi.mock("@/lib/agent/tool-filter", () => ({
  filterToolsByJourneyState: vi.fn((tools: unknown) => tools),
}));

vi.mock("@/lib/db", () => ({
  db: { insert: vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) })) },
  sqlite: { prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn(() => ({ count: 0 })) })) },
}));

vi.mock("@/lib/db/schema", () => ({
  messages: {},
}));

vi.mock("@/lib/services/summary-service", () => ({
  enqueueSummaryJob: vi.fn(),
}));

vi.mock("@/lib/services/confirmation-service", () => ({
  pruneUnconfirmedPendings: vi.fn(),
}));

// Mock import-event: controllable flag
const mockConsumeImportEvent = vi.fn();
const mockMarkImportEventConsumed = vi.fn();
const mockRevertImportEvent = vi.fn();
vi.mock("@/lib/connectors/import-event", () => ({
  consumeImportEvent: (...args: unknown[]) => mockConsumeImportEvent(...args),
  markImportEventConsumed: (...args: unknown[]) => mockMarkImportEventConsumed(...args),
  revertImportEvent: (...args: unknown[]) => mockRevertImportEvent(...args),
}));

// Mock gap analyzer
const mockAnalyzeImportGaps = vi.fn(() => ({
  summary: { currentRole: "CTO at Startup", pastRoles: 2, educationCount: 1, languageCount: 1, skillCount: 5, certificationCount: 0 },
  gaps: [{ priority: 1, type: "no_interests", description: "No interests found." }],
}));
vi.mock("@/lib/connectors/import-gap-analyzer", () => ({
  analyzeImportGaps: (...args: unknown[]) => mockAnalyzeImportGaps(...args),
}));

// Mock getActiveFacts (may already be imported by route; mock to return empty)
vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: vi.fn(() => []),
}));

import { assembleContext } from "@/lib/agent/context";
import { streamText } from "ai";

beforeEach(async () => {
  vi.clearAllMocks();
  mockConsumeImportEvent.mockReturnValue(null); // default: no flag

  // Reset mocks that individual tests may override back to defaults.
  // vi.clearAllMocks() clears call history but does NOT undo mockReturnValue
  // set via vi.mocked() — those stick across tests and cause flakiness.
  const { resolveOwnerScope, getAuthContext } = await import("@/lib/auth/session");
  vi.mocked(resolveOwnerScope).mockReturnValue({
    cognitiveOwnerKey: "cog-1",
    knowledgeReadKeys: ["sess-a"],
    knowledgePrimaryKey: "sess-a",
    currentSessionId: "sess-a",
  } as any);
  vi.mocked(getAuthContext).mockReturnValue(null);

  const sessionService = await import("@/lib/services/session-service");
  vi.mocked(sessionService.isMultiUserEnabled).mockReturnValue(false);
  vi.mocked(sessionService.getMessageCount).mockReturnValue(0);
  vi.mocked(sessionService.getMessageLimit).mockReturnValue(50);
});

function makeRequest(body?: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Ho importato il mio profilo LinkedIn" }],
      ...body,
    }),
  });
}

describe("POST /api/chat import flag wiring", () => {
  it("calls consumeImportEvent with writeSessionId", async () => {
    const { POST } = await import("@/app/api/chat/route");
    await POST(makeRequest());

    // writeSessionId = effectiveScope.knowledgePrimaryKey = "sess-a"
    expect(mockConsumeImportEvent).toHaveBeenCalledWith("sess-a");
  });

  it("populates bootstrap.importGapReport when flag is consumed", async () => {
    mockConsumeImportEvent.mockReturnValue({
      importId: "imp-1",
      factsWritten: 10,
      timestamp: Date.now(),
      status: "processing",
    });

    const { POST } = await import("@/app/api/chat/route");
    await POST(makeRequest());

    // assembleContext args in single-user mode:
    // (scope, language, messages, authInfo=undefined, bootstrap, bootstrapData, quotaInfo=undefined)
    expect(assembleContext).toHaveBeenCalledWith(
      expect.any(Object),      // scope
      expect.any(String),       // language
      expect.any(Array),        // messages
      undefined,                // authInfo: single-user → chatAuthCtx is null → undefined
      expect.objectContaining({
        importGapReport: expect.objectContaining({
          summary: expect.objectContaining({ currentRole: "CTO at Startup" }),
        }),
      }),                       // bootstrap
      expect.any(Object),       // bootstrapData
      undefined,                // quotaInfo: single-user → no quota tracking
    );
  });

  it("does not call analyzeImportGaps when no flag present", async () => {
    mockConsumeImportEvent.mockReturnValue(null);

    const { POST } = await import("@/app/api/chat/route");
    await POST(makeRequest());

    expect(mockAnalyzeImportGaps).not.toHaveBeenCalled();
  });

  it("forces has_recent_import situation when flag is consumed", async () => {
    mockConsumeImportEvent.mockReturnValue({
      importId: "imp-2",
      factsWritten: 5,
      timestamp: Date.now(),
      status: "processing",
    });

    const { POST } = await import("@/app/api/chat/route");
    await POST(makeRequest());

    expect(assembleContext).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      expect.any(Array),
      undefined,                // single-user: no auth context
      expect.objectContaining({
        situations: expect.arrayContaining(["has_recent_import"]),
      }),
      expect.any(Object),
      undefined,                // single-user: no quotaInfo
    );
  });

  it("does not consume flag if quota rejects (429 path)", async () => {
    // Use anonymous multi-user path for 429.
    // The route checks isAuthenticated = (cognitiveOwnerKey !== currentSessionId).
    // Default mock scope has cognitiveOwnerKey="cog-1" !== currentSessionId="sess-a" → authenticated.
    // Override to anonymous scope where they match:
    const { resolveOwnerScope } = await import("@/lib/auth/session");
    vi.mocked(resolveOwnerScope).mockReturnValue({
      cognitiveOwnerKey: "sess-anon",
      knowledgeReadKeys: ["sess-anon"],
      knowledgePrimaryKey: "sess-anon",
      currentSessionId: "sess-anon",
    } as any);

    const sessionService = await import("@/lib/services/session-service");
    vi.mocked(sessionService.isMultiUserEnabled).mockReturnValue(true);
    vi.mocked(sessionService.getMessageCount).mockReturnValue(50); // at limit
    vi.mocked(sessionService.getMessageLimit).mockReturnValue(50);

    // getAuthContext already returns null (anonymous)

    // Set up flag (should never be consumed)
    mockConsumeImportEvent.mockReturnValue({
      importId: "imp-3",
      factsWritten: 5,
      timestamp: Date.now(),
      status: "processing",
    });

    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(makeRequest());

    // Route returns 429 via anonymous getMessageCount path before consume point
    expect(res.status).toBe(429);
    // consumeImportEvent must NOT have been called
    expect(mockConsumeImportEvent).not.toHaveBeenCalled();
  });

  it("reverts flag on pre-stream error", async () => {
    mockConsumeImportEvent.mockReturnValue({
      importId: "imp-4",
      factsWritten: 5,
      timestamp: Date.now(),
      status: "processing",
    });

    // Make streamText throw to simulate pre-stream error
    vi.mocked(streamText).mockImplementationOnce(() => { throw new Error("LLM unavailable"); });

    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(mockRevertImportEvent).toHaveBeenCalledWith("sess-a");
    expect(mockMarkImportEventConsumed).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test**

Run: `npx vitest run tests/evals/chat-route-import-flag.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add tests/evals/chat-route-import-flag.test.ts
git commit -m "test: add route-level test for import flag wiring in chat route"
```

---

### Task 12: Final Verification + Deploy

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Commit any remaining changes**

**Step 3: Push and deploy**

```bash
git push origin main
```

Deploy via Coolify API (see `docs/DEPLOY.md`).

**Step 4: Manual E2E test**

1. Open openself.dev/builder
2. Import a LinkedIn ZIP file
3. Verify:
   - Chat shows "Ho importato il mio profilo LinkedIn" message
   - Agent responds with brief acknowledgment mentioning current role
   - Agent asks about interests/hobbies (first gap)
   - On "genera la pagina" → agent generates immediately
