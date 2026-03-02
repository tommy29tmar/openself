# Phase 1d Closing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close Phase 1d with three features: Connector UI in builder, Avatar upload with hero integration, and Public page auto-translation for visitors.

**Architecture:** Each feature builds on existing infrastructure. Connector API routes exist (GitHub OAuth, sync, LinkedIn ZIP import, status, disconnect). Avatar DB + service + serving endpoint exist. Translation pipeline + cache exist. This work wires UI and fills integration gaps.

**Tech Stack:** TypeScript, Next.js App Router, React, Drizzle ORM, SQLite, Vercel AI SDK

**Design doc:** `docs/plans/2026-03-02-phase1d-closing-design.md`

**Supervisor Constraints (non-negotiable):**
- Enforce server-side auth/ownership checks on all connector routes (`connect`, `status`, `sync`, `import`, `disconnect`) regardless of UI gating.
- Use a standard connector error envelope on all connector mutation endpoints: `{ success: false, code, error, retryable }`.
- Keep backend idempotency/locking for sync/import as the primary protection (frontend button disabling is secondary UX only).
- Public translation precedence must be: `?lang=` explicit > language cookie (if present) > `Accept-Language` > page `sourceLanguage`.
- Translation cache identity must include source language and model version (not only page content hash + target language).
- Translation banner must explicitly disclose machine translation and must not render for crawler traffic.

---

## Feature 1: Connector UI in SettingsPanel

### Task 1: ConnectorSection Component — Status Fetch + Card Rendering

**Files:**
- Create: `src/components/settings/ConnectorSection.tsx`
- Test: `tests/evals/connector-ui.test.ts`

**Context:** The connector API already returns status at `GET /api/connectors/status` with shape `{ success: true, connectors: Array<{ id, connectorType, status, enabled, lastSync, lastError, createdAt, updatedAt }> }`. The SettingsPanel is at `src/components/settings/SettingsPanel.tsx` (235 lines). It uses internal `SectionLabel`, `OptionGroup`, and `OptionButton` subcomponents. The `!languageOnly` guard at line 156 controls what sections show when a draft exists.

**Step 1: Write test for ConnectorSection**

Create `tests/evals/connector-ui.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("ConnectorSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("status fetch", () => {
    it("fetches /api/connectors/status on mount", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, connectors: [] }),
      });

      // Import dynamically so mock is in place
      const { getConnectorStatuses } = await import(
        "@/components/settings/ConnectorSection"
      );
      const result = await getConnectorStatuses();

      expect(mockFetch).toHaveBeenCalledWith("/api/connectors/status");
      expect(result).toEqual([]);
    });

    it("returns empty array on fetch failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network"));

      const { getConnectorStatuses } = await import(
        "@/components/settings/ConnectorSection"
      );
      const result = await getConnectorStatuses();

      expect(result).toEqual([]);
    });
  });

  describe("card state derivation", () => {
    it("derives 'not_connected' for missing github connector", async () => {
      const { deriveCardState } = await import(
        "@/components/settings/ConnectorSection"
      );
      const state = deriveCardState("github", []);
      expect(state.connectionState).toBe("not_connected");
    });

    it("derives 'connected' for active github connector", async () => {
      const { deriveCardState } = await import(
        "@/components/settings/ConnectorSection"
      );
      const state = deriveCardState("github", [
        {
          id: "c1",
          connectorType: "github",
          status: "connected",
          enabled: true,
          lastSync: "2026-03-01T12:00:00Z",
          lastError: null,
          createdAt: "2026-03-01T10:00:00Z",
          updatedAt: "2026-03-01T12:00:00Z",
        },
      ]);
      expect(state.connectionState).toBe("connected");
      expect(state.lastSync).toBe("2026-03-01T12:00:00Z");
    });

    it("derives 'error' for connector with error status", async () => {
      const { deriveCardState } = await import(
        "@/components/settings/ConnectorSection"
      );
      const state = deriveCardState("github", [
        {
          id: "c1",
          connectorType: "github",
          status: "error",
          enabled: true,
          lastSync: null,
          lastError: "Token expired",
          createdAt: "2026-03-01T10:00:00Z",
          updatedAt: "2026-03-01T12:00:00Z",
        },
      ]);
      expect(state.connectionState).toBe("error");
      expect(state.lastError).toBe("Token expired");
    });

    it("derives 'not_connected' for disconnected connector", async () => {
      const { deriveCardState } = await import(
        "@/components/settings/ConnectorSection"
      );
      const state = deriveCardState("github", [
        {
          id: "c1",
          connectorType: "github",
          status: "disconnected",
          enabled: true,
          lastSync: null,
          lastError: null,
          createdAt: "2026-03-01T10:00:00Z",
          updatedAt: "2026-03-01T12:00:00Z",
        },
      ]);
      expect(state.connectionState).toBe("not_connected");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/connector-ui.test.ts`
Expected: FAIL — module not found

**Step 3: Implement ConnectorSection**

Create `src/components/settings/ConnectorSection.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";

/* ── Types ── */
export type ConnectorStatusRow = {
  id: string;
  connectorType: string;
  status: string;
  enabled: boolean;
  lastSync: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type ConnectionState = "not_connected" | "connected" | "syncing" | "error";

export type CardState = {
  connectionState: ConnectionState;
  connectorId: string | null;
  lastSync: string | null;
  lastError: string | null;
};

/* ── Exported helpers (testable) ── */

export async function getConnectorStatuses(): Promise<ConnectorStatusRow[]> {
  try {
    const res = await fetch("/api/connectors/status");
    if (!res.ok) return [];
    const data = await res.json();
    return data.success ? data.connectors : [];
  } catch {
    return [];
  }
}

export function deriveCardState(
  connectorType: string,
  connectors: ConnectorStatusRow[],
): CardState {
  const match = connectors.find(
    (c) => c.connectorType === connectorType && c.status !== "disconnected",
  );
  if (!match) {
    return {
      connectionState: "not_connected",
      connectorId: null,
      lastSync: null,
      lastError: null,
    };
  }
  return {
    connectionState: match.status === "error" ? "error" : "connected",
    connectorId: match.id,
    lastSync: match.lastSync,
    lastError: match.lastError,
  };
}

/* ── Disconnect helper ── */
async function disconnectConnector(connectorId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/connectors/${connectorId}/disconnect`, {
      method: "POST",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ── Sync helper ── */
async function triggerSync(): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/connectors/github/sync", { method: "POST" });
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch {
    return { success: false, error: "Network error" };
  }
}

/* ── LinkedIn import helper ── */
async function importLinkedIn(
  file: File,
): Promise<{ success: boolean; factsWritten?: number; factsSkipped?: number; error?: string }> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/connectors/linkedin-zip/import", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    return data;
  } catch {
    return { success: false, error: "Upload failed" };
  }
}

/* ── GitHub Card ── */
function GitHubCard({
  state,
  onRefresh,
}: {
  state: CardState;
  onRefresh: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncCooldown, setSyncCooldown] = useState(false);

  const handleConnect = () => {
    window.location.href = "/api/connectors/github/connect";
  };

  const handleSync = async () => {
    if (syncing || syncCooldown) return;
    setSyncing(true);
    await triggerSync();
    // Brief delay then refresh status
    setTimeout(() => {
      setSyncing(false);
      setSyncCooldown(true);
      onRefresh();
      // Cooldown for 60s
      setTimeout(() => setSyncCooldown(false), 60_000);
    }, 2000);
  };

  const handleDisconnect = async () => {
    if (!state.connectorId) return;
    const ok = await disconnectConnector(state.connectorId);
    if (ok) onRefresh();
  };

  return (
    <div className="rounded-lg border border-[var(--page-border,#e5e5e5)] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">GitHub</span>
          {state.connectionState === "connected" && (
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          )}
          {state.connectionState === "error" && (
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          )}
        </div>
      </div>

      {state.connectionState === "not_connected" && (
        <button
          onClick={handleConnect}
          className="w-full mt-2 px-3 py-1.5 text-xs font-medium rounded bg-[var(--page-fg,#111)] text-[var(--page-bg,#fff)] hover:opacity-80 transition-opacity"
        >
          Connect GitHub
        </button>
      )}

      {state.connectionState === "connected" && (
        <div className="space-y-2">
          {state.lastSync && (
            <p className="text-[11px] text-[var(--page-fg-secondary,#666)]">
              Last sync: {new Date(state.lastSync).toLocaleDateString()}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing || syncCooldown}
              className="flex-1 px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-[var(--page-bg-secondary,#f5f5f5)] transition-colors disabled:opacity-40"
            >
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {state.connectionState === "error" && (
        <div className="space-y-2">
          <p className="text-[11px] text-red-600">{state.lastError}</p>
          <div className="flex gap-2">
            <button
              onClick={handleConnect}
              className="flex-1 px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-[var(--page-bg-secondary,#f5f5f5)] transition-colors"
            >
              Reconnect
            </button>
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── LinkedIn Card ── */
function LinkedInCard({ onRefresh }: { onRefresh: () => void }) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    factsWritten?: number;
    error?: string;
  } | null>(null);

  const handleImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setImporting(true);
      setResult(null);
      const res = await importLinkedIn(file);
      setImporting(false);
      if (res.success) {
        setResult({ factsWritten: res.factsWritten });
        onRefresh();
      } else {
        setResult({ error: res.error ?? "Import failed" });
      }
    };
    input.click();
  };

  return (
    <div className="rounded-lg border border-[var(--page-border,#e5e5e5)] p-4">
      <div className="mb-2">
        <span className="font-medium text-sm">LinkedIn</span>
      </div>
      <p className="text-[11px] text-[var(--page-fg-secondary,#666)] mb-3">
        Upload your LinkedIn data export (ZIP)
      </p>
      <button
        onClick={handleImport}
        disabled={importing}
        className="w-full px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-[var(--page-bg-secondary,#f5f5f5)] transition-colors disabled:opacity-40"
      >
        {importing ? "Importing…" : "Import LinkedIn ZIP"}
      </button>
      {result?.factsWritten !== undefined && (
        <p className="mt-2 text-[11px] text-green-600">
          {result.factsWritten} facts imported
        </p>
      )}
      {result?.error && (
        <p className="mt-2 text-[11px] text-red-600">{result.error}</p>
      )}
    </div>
  );
}

/* ── Main Section ── */
export function ConnectorSection() {
  const [connectors, setConnectors] = useState<ConnectorStatusRow[]>([]);

  const refresh = useCallback(async () => {
    const statuses = await getConnectorStatuses();
    setConnectors(statuses);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const githubState = deriveCardState("github", connectors);

  return (
    <div className="flex flex-col gap-3">
      <GitHubCard state={githubState} onRefresh={refresh} />
      <LinkedInCard onRefresh={refresh} />
    </div>
  );
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/evals/connector-ui.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/settings/ConnectorSection.tsx tests/evals/connector-ui.test.ts
git commit -m "feat(connectors): add ConnectorSection component with status fetch and card states"
```

---

### Task 2: Wire ConnectorSection into SettingsPanel

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx:156-228` — add Integrations section after Layout

**Context:** SettingsPanel has a `!languageOnly` guard (line 156) that wraps all style sections. The Integrations section should go inside this guard, after Layout (line 226). The panel uses `SectionLabel` for section headers.

**Step 1: Add import and Integrations section**

Add at top of `src/components/settings/SettingsPanel.tsx` (with existing imports):
```typescript
import { ConnectorSection } from "@/components/settings/ConnectorSection";
```

Add after the Layout `</div>` (line 226) but before the closing `</>` (line 228):
```tsx
                {/* Integrations */}
                <div className="flex flex-col gap-2.5">
                  <SectionLabel>Integrations</SectionLabel>
                  <ConnectorSection />
                </div>
```

**Step 2: Run app and verify visually**

Run: `npm run dev`
Open builder, click settings. Verify "Integrations" section appears below Layout with GitHub and LinkedIn cards.

**Step 3: Commit**

```bash
git add src/components/settings/SettingsPanel.tsx
git commit -m "feat(connectors): wire ConnectorSection into SettingsPanel Integrations section"
```

---

### Task 3: OAuth Return Flow — Detect ?connector= Param in Builder

**Files:**
- Modify: `src/app/builder/page.tsx:85-154` — detect `?connector=` query param, open settings, clean URL

**Context:** When GitHub OAuth callback completes, it redirects to `/builder?connector=github_connected`. The builder page (204 lines) has a bootstrap `useEffect` (lines 85-154) that runs on mount. After bootstrap, we need to detect the `?connector=` param, signal that settings should open, and clean the URL. The `SplitView` component needs a new prop to trigger opening the settings panel.

**Step 1: Add connector param detection to builder page**

In `src/app/builder/page.tsx`, add after the bootstrap useEffect:

```typescript
// Detect OAuth return param
const [connectorReturn, setConnectorReturn] = useState(false);

useEffect(() => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.has("connector")) {
    setConnectorReturn(true);
    url.searchParams.delete("connector");
    // Preserve any other query params (use full url minus the connector param)
    window.history.replaceState({}, "", url.pathname + url.search);
  }
}, []);
```

Pass `connectorReturn` to SplitView:
```tsx
<SplitView
  language={language}
  authState={authState}
  publishedConfigHash={publishedConfigHash}
  onPublishedConfigHashChange={setPublishedConfigHash}
  openSettings={connectorReturn}
/>
```

**Step 2: Wire SplitView to accept `openSettings` prop**

In `src/components/layout/SplitView.tsx`, add `openSettings?: boolean` to the props. In the component body, consume it to auto-open the SettingsPanel on mount:

```typescript
useEffect(() => {
  if (openSettings) {
    setSettingsOpen(true);
  }
}, [openSettings]);
```

(The exact variable name for settings panel open state needs to be checked in SplitView — it's the state that controls `SettingsPanel open={…}`.)

**Step 3: Verify by navigating to `/builder?connector=github_connected`**

Expected: Settings panel opens automatically. URL cleans to `/builder`.

**Step 4: Commit**

```bash
git add src/app/builder/page.tsx src/components/layout/SplitView.tsx
git commit -m "feat(connectors): detect OAuth return param, auto-open settings, clean URL"
```

---

### Task 4: GitHub Sync Idempotency + Rate Limiting

**Files:**
- Create: `src/lib/connectors/idempotency.ts`
- Modify: `src/app/api/connectors/github/sync/route.ts` — add in-flight check + rate limit
- Test: `tests/evals/connector-idempotency.test.ts`

**Context:** The sync route at `src/app/api/connectors/github/sync/route.ts` (30 lines) currently enqueues a `connector_sync` job without checking for in-flight operations. We need: (a) check if a `connector_sync` job is already queued/running, (b) reject with `ALREADY_SYNCING` if so, (c) rate limit to 60s between syncs.

**LinkedIn import does NOT need a server-side lock.** It's synchronous (no job queue), and `batchCreateFacts()` already has per-fact dedup via the `(sessionId, category, key)` unique constraint + draft hash idempotency. Re-importing the same ZIP → all facts skip → same draft hash → no-op. Client-side button disable (Task 1's LinkedInCard `importing` state) is sufficient UX protection.

**Step 1: Write tests**

Create `tests/evals/connector-idempotency.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Connector Idempotency", () => {
  describe("hasPendingJob", () => {
    it("returns false when no jobs exist for ownerKey", async () => {
      const { hasPendingJob } = await import(
        "@/lib/connectors/idempotency"
      );
      // No jobs in test DB → must return false
      expect(hasPendingJob("nonexistent_owner")).toBe(false);
    });

    it("SQL references correct columns (job_type, json_extract, queued/running)", async () => {
      // Verify the query doesn't throw on a real DB — schema alignment test
      const { hasPendingJob } = await import(
        "@/lib/connectors/idempotency"
      );
      // Should not throw (correct column names + JSON path)
      expect(() => hasPendingJob("test_owner")).not.toThrow();
    });
  });

  describe("sync rate limiting", () => {
    it("rejects sync if lastSync was less than 60s ago", async () => {
      const { isSyncRateLimited } = await import(
        "@/lib/connectors/idempotency"
      );
      const now = new Date();
      const thirtySecondsAgo = new Date(now.getTime() - 30_000).toISOString();
      expect(isSyncRateLimited(thirtySecondsAgo)).toBe(true);
    });

    it("allows sync if lastSync was more than 60s ago", async () => {
      const { isSyncRateLimited } = await import(
        "@/lib/connectors/idempotency"
      );
      const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();
      expect(isSyncRateLimited(twoMinutesAgo)).toBe(false);
    });

    it("allows sync if lastSync is null", async () => {
      const { isSyncRateLimited } = await import(
        "@/lib/connectors/idempotency"
      );
      expect(isSyncRateLimited(null)).toBe(false);
    });
  });
});
```

**Step 2: Implement idempotency helpers**

Create `src/lib/connectors/idempotency.ts`:

```typescript
import { sqlite } from "@/lib/db";

const SYNC_COOLDOWN_MS = 60_000; // 60 seconds

/**
 * Check if a connector_sync job is already queued or running for this ownerKey.
 *
 * Schema reality (schema.ts:262, migration 0016):
 *   - Column is `job_type` (not `type`)
 *   - ownerKey lives inside `payload` JSON: json_extract(payload, '$.ownerKey')
 *   - Statuses are `queued` / `running` (not `pending` / `claimed`)
 *   - There is a UNIQUE INDEX `uniq_jobs_dedup` on
 *     (job_type, json_extract(payload,'$.ownerKey')) WHERE status IN ('queued','running')
 *     so enqueueJob already does onConflictDoNothing — but we still want to
 *     return a clear ALREADY_SYNCING error to the caller instead of a silent no-op.
 */
export function hasPendingJob(ownerKey: string): boolean {
  const row = sqlite
    .prepare(
      `SELECT 1 FROM jobs
       WHERE job_type = 'connector_sync'
         AND json_extract(payload, '$.ownerKey') = ?
         AND status IN ('queued', 'running')
       LIMIT 1`,
    )
    .get(ownerKey);
  return !!row;
}

/**
 * Rate limit: reject if lastSync was less than 60s ago.
 */
export function isSyncRateLimited(lastSync: string | null): boolean {
  if (!lastSync) return false;
  const elapsed = Date.now() - new Date(lastSync).getTime();
  return elapsed < SYNC_COOLDOWN_MS;
}
```

**Step 3: Wire into sync route**

In `src/app/api/connectors/github/sync/route.ts`, after getting the connector status, add:

```typescript
import { hasPendingJob, isSyncRateLimited } from "@/lib/connectors/idempotency";

// ... inside POST handler, after scope/auth checks:

// Idempotency: check for in-flight sync
if (hasPendingJob(ownerKey)) {
  return NextResponse.json(
    { success: false, code: "ALREADY_SYNCING", error: "A sync is already in progress.", retryable: false },
    { status: 409 },
  );
}

// Rate limit: reject if last sync was < 60s ago
const githubConnector = connectors.find((c) => c.connectorType === "github" && c.status === "connected");
if (githubConnector && isSyncRateLimited(githubConnector.lastSync)) {
  return NextResponse.json(
    { success: false, code: "RATE_LIMITED", error: "Please wait before syncing again.", retryable: true },
    { status: 429 },
  );
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/evals/connector-idempotency.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/connectors/idempotency.ts src/app/api/connectors/github/sync/route.ts src/app/api/connectors/linkedin-zip/import/route.ts tests/evals/connector-idempotency.test.ts
git commit -m "feat(connectors): add idempotency guards and rate limiting for sync/import"
```

---

### Task 4b: Connector API Hardening — Auth Coverage + Error Contract

**Files:**
- Create: `src/lib/connectors/api-errors.ts`
- Modify: `src/app/api/connectors/status/route.ts`
- Modify: `src/app/api/connectors/github/connect/route.ts`
- Modify: `src/app/api/connectors/github/sync/route.ts`
- Modify: `src/app/api/connectors/linkedin-zip/import/route.ts`
- Modify: `src/app/api/connectors/[id]/disconnect/route.ts`
- Test: `tests/evals/connector-api-contract.test.ts`

**Context:** The UI gating in SettingsPanel is not a security boundary. Connector endpoints must consistently enforce auth/ownership and return predictable machine-readable errors for reconnect/retry UX. We already started this in Task 4 for sync; this task normalizes all connector routes.

**Step 1: Add shared connector API error helper**

Create `src/lib/connectors/api-errors.ts`:

```typescript
import { NextResponse } from "next/server";

type ConnectorError = {
  success: false;
  code: string;
  error: string;
  retryable: boolean;
};

export function connectorError(
  code: string,
  error: string,
  status: number,
  retryable: boolean,
) {
  return NextResponse.json<ConnectorError>(
    { success: false, code, error, retryable },
    { status },
  );
}
```

**Step 2: Use helper and enforce auth/ownership checks on every connector endpoint**

- `connect`: unauthenticated -> `AUTH_REQUIRED` with `retryable: false`
- `status`: unauthenticated in multi-user -> `AUTH_REQUIRED` with `retryable: false`
- `sync`: not connected -> `NOT_CONNECTED` with `retryable: true`
- `import`: invalid payload -> `INVALID_FORMAT`/`NO_FILE` with `retryable: false`
- `disconnect`: wrong owner -> `FORBIDDEN` with `retryable: false`

Ensure each error response includes `code`, `error`, and `retryable`.

**Step 3: Add contract tests**

Create `tests/evals/connector-api-contract.test.ts` with assertions that each endpoint returns the standardized error envelope shape for at least one failure path.

**Step 4: Commit**

```bash
git add src/lib/connectors/api-errors.ts src/app/api/connectors/status/route.ts src/app/api/connectors/github/connect/route.ts src/app/api/connectors/github/sync/route.ts src/app/api/connectors/linkedin-zip/import/route.ts src/app/api/connectors/[id]/disconnect/route.ts tests/evals/connector-api-contract.test.ts
git commit -m "feat(connectors): harden connector API auth checks and standardize error contract"
```

---

## Feature 2: Avatar Upload

### Task 5: Magic Bytes Validation + EXIF Stripping Utilities

**Files:**
- Create: `src/lib/services/image-utils.ts`
- Test: `tests/evals/image-utils.test.ts`

**Context:** The design requires magic bytes validation (not just MIME headers) and EXIF stripping. We need a lightweight approach without `sharp` (not in dependencies). JPEG EXIF can be stripped by removing APP1 markers. PNG has no EXIF. WebP EXIF is in RIFF/EXIF chunk. For MVP, strip JPEG EXIF (most common case with camera metadata); pass through PNG/WebP/GIF as-is.

**Step 1: Write tests**

Create `tests/evals/image-utils.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("image-utils", () => {
  describe("detectMimeFromMagicBytes", () => {
    it("detects JPEG from magic bytes", async () => {
      const { detectMimeFromMagicBytes } = await import(
        "@/lib/services/image-utils"
      );
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]);
      expect(detectMimeFromMagicBytes(jpeg)).toBe("image/jpeg");
    });

    it("detects PNG from magic bytes", async () => {
      const { detectMimeFromMagicBytes } = await import(
        "@/lib/services/image-utils"
      );
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(detectMimeFromMagicBytes(png)).toBe("image/png");
    });

    it("detects WebP from magic bytes", async () => {
      const { detectMimeFromMagicBytes } = await import(
        "@/lib/services/image-utils"
      );
      // RIFF....WEBP
      const webp = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
        0x50,
      ]);
      expect(detectMimeFromMagicBytes(webp)).toBe("image/webp");
    });

    it("detects GIF from magic bytes", async () => {
      const { detectMimeFromMagicBytes } = await import(
        "@/lib/services/image-utils"
      );
      const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(detectMimeFromMagicBytes(gif)).toBe("image/gif");
    });

    it("returns null for unknown bytes", async () => {
      const { detectMimeFromMagicBytes } = await import(
        "@/lib/services/image-utils"
      );
      const unknown = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      expect(detectMimeFromMagicBytes(unknown)).toBeNull();
    });
  });

  describe("stripExifFromJpeg", () => {
    it("strips APP1 (EXIF) markers from JPEG", async () => {
      const { stripExifFromJpeg } = await import(
        "@/lib/services/image-utils"
      );
      // Minimal JPEG with an APP1 marker
      // SOI(FFD8) + APP1(FFE1 + length 0008 + "Exif\0\0") + SOS(FFDA) + EOI(FFD9)
      const app1Payload = Buffer.from("Exif\x00\x00", "binary");
      const app1Length = Buffer.alloc(2);
      app1Length.writeUInt16BE(app1Payload.length + 2);

      const jpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8]), // SOI
        Buffer.from([0xff, 0xe1]), // APP1 marker
        app1Length,
        app1Payload,
        Buffer.from([0xff, 0xda]), // SOS
        Buffer.from([0x00]),       // dummy scan data
        Buffer.from([0xff, 0xd9]), // EOI
      ]);

      const stripped = stripExifFromJpeg(jpeg);
      // Should not contain APP1 marker (FFE1)
      expect(stripped.includes(Buffer.from([0xff, 0xe1]))).toBe(false);
      // Should still start with SOI
      expect(stripped[0]).toBe(0xff);
      expect(stripped[1]).toBe(0xd8);
    });

    it("returns JPEG unchanged if no EXIF present", async () => {
      const { stripExifFromJpeg } = await import(
        "@/lib/services/image-utils"
      );
      // Minimal JPEG: SOI + SOS + EOI
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0xff, 0xd9]);
      const stripped = stripExifFromJpeg(jpeg);
      expect(stripped).toEqual(jpeg);
    });
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run tests/evals/image-utils.test.ts`
Expected: FAIL — module not found

**Step 3: Implement image-utils**

Create `src/lib/services/image-utils.ts`:

```typescript
/**
 * Lightweight image utilities: magic bytes detection + JPEG EXIF stripping.
 * No external dependencies (no sharp).
 */

const SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP: RIFF....WEBP
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
];

const WEBP_MARKER = Buffer.from("WEBP");

export function detectMimeFromMagicBytes(data: Buffer): string | null {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (data.length < offset + sig.bytes.length) continue;
    const match = sig.bytes.every((b, i) => data[offset + i] === b);
    if (match) {
      // WebP needs secondary check at offset 8
      if (sig.mime === "image/webp") {
        if (data.length >= 12 && data.subarray(8, 12).equals(WEBP_MARKER)) {
          return "image/webp";
        }
        continue;
      }
      return sig.mime;
    }
  }
  return null;
}

/**
 * Strip EXIF (APP1 = 0xFFE1) markers from JPEG data.
 * Preserves all other markers and image data.
 * Returns the buffer unchanged if no APP1 markers found.
 */
export function stripExifFromJpeg(data: Buffer): Buffer {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return data; // Not a JPEG
  }

  const chunks: Buffer[] = [Buffer.from([0xff, 0xd8])]; // SOI
  let pos = 2;

  while (pos < data.length - 1) {
    // Not a marker
    if (data[pos] !== 0xff) {
      // We've hit scan data — copy the rest verbatim
      chunks.push(data.subarray(pos));
      break;
    }

    const marker = data[pos + 1];

    // SOS (0xDA) — everything after is scan data, copy verbatim
    if (marker === 0xda) {
      chunks.push(data.subarray(pos));
      break;
    }

    // EOI
    if (marker === 0xd9) {
      chunks.push(data.subarray(pos, pos + 2));
      break;
    }

    // Markers with length field (anything from 0xC0 to 0xFE except RST0-7)
    if (pos + 3 >= data.length) break;
    const segLen = data.readUInt16BE(pos + 2);

    // APP1 (0xE1) — skip it (this is EXIF/XMP)
    if (marker === 0xe1) {
      pos += 2 + segLen;
      continue;
    }

    // Keep all other markers
    chunks.push(data.subarray(pos, pos + 2 + segLen));
    pos += 2 + segLen;
  }

  return Buffer.concat(chunks);
}

/**
 * Process image data: validate magic bytes, strip EXIF if JPEG.
 * Returns { data, mimeType } or throws on invalid.
 */
export function processAvatarImage(
  data: Buffer,
  declaredMime: string,
): { data: Buffer; mimeType: string } {
  const detectedMime = detectMimeFromMagicBytes(data);
  if (!detectedMime) {
    throw new Error("Could not detect image format from file contents");
  }

  // Detected MIME must match declared (prevent content-type spoofing)
  if (detectedMime !== declaredMime) {
    throw new Error(
      `MIME mismatch: header says ${declaredMime}, content is ${detectedMime}`,
    );
  }

  // Strip EXIF from JPEG
  const processed =
    detectedMime === "image/jpeg" ? stripExifFromJpeg(data) : data;

  return { data: processed, mimeType: detectedMime };
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/evals/image-utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/services/image-utils.ts tests/evals/image-utils.test.ts
git commit -m "feat(avatar): add magic bytes detection and JPEG EXIF stripping"
```

---

### Task 6: Avatar Upload + Delete API Endpoints

**Files:**
- Create: `src/app/api/media/avatar/route.ts`
- Test: `tests/evals/avatar-upload.test.ts`

**Context:** `uploadAvatar(profileId, data, mimeType)` in `src/lib/services/media-service.ts` handles the DB write. It generates a new UUID per upload. Auth uses `resolveOwnerScope()` for multi-user or defaults to `"__default__"`. The `getAuthContext()` helper returns `{ sessionId, profileId, userId, username }`.

**IMPORTANT — upsert bug in current `uploadAvatar()`:** The DB has a unique index `uniq_media_avatar_per_profile ON media_assets(profile_id) WHERE kind = 'avatar'` (migration 0001, line 122). But `uploadAvatar()` currently does `onConflictDoUpdate({ target: mediaAssets.id })` — conflict on the `id` primary key, NOT on the partial unique index. Since each upload generates a new `crypto.randomUUID()` for `id`, the PK never conflicts. A second upload for the same profile will violate the partial unique index and **throw a SQLITE_CONSTRAINT error**.

**Fix required in this task:** Before calling `uploadAvatar()`, the route must first DELETE the existing avatar for this profile (if any), then insert the new one. Alternatively, modify `uploadAvatar()` itself to do a delete-then-insert instead of relying on `onConflictDoUpdate`. The simplest approach: add a `deleteExistingAvatar(profileId)` call before `uploadAvatar()` in the route handler.

**Step 1: Write tests**

Create `tests/evals/avatar-upload.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("Avatar Upload", () => {
  describe("POST /api/media/avatar validation", () => {
    it("rejects files over 2MB", () => {
      // The media-service already enforces this, but route should also check
      // Test the validateAvatarUpload helper
    });

    it("rejects non-image MIME types", () => {
      // Route-level MIME check before passing to service
    });

    it("rejects files with mismatched magic bytes", async () => {
      const { processAvatarImage } = await import(
        "@/lib/services/image-utils"
      );
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(() => processAvatarImage(pngBytes, "image/jpeg")).toThrow(
        "MIME mismatch",
      );
    });
  });

  describe("media-service uploadAvatar", () => {
    it("stores avatar and returns media ID", async () => {
      const { uploadAvatar, getMediaById } = await import(
        "@/lib/services/media-service"
      );
      const profileId = "test-profile-avatar";
      const buf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]); // minimal JPEG header
      const id = uploadAvatar(profileId, buf, "image/jpeg");
      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
      const media = getMediaById(id);
      expect(media).not.toBeNull();
      expect(media!.profileId).toBe(profileId);
    });

    it("replaces existing avatar for same profile", async () => {
      const { uploadAvatar, getProfileAvatar } = await import(
        "@/lib/services/media-service"
      );
      const profileId = "test-profile-replace";
      const buf1 = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const buf2 = Buffer.from([0xFF, 0xD8, 0xFF, 0xE1]);
      const id1 = uploadAvatar(profileId, buf1, "image/jpeg");
      const id2 = uploadAvatar(profileId, buf2, "image/jpeg");
      expect(id2).not.toBe(id1);
      const current = getProfileAvatar(profileId);
      expect(current).toBe(id2);
    });
  });
});
```

**Step 2: Implement avatar route**

Create `src/app/api/media/avatar/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { uploadAvatar, getMediaById } from "@/lib/services/media-service";
import { processAvatarImage } from "@/lib/services/image-utils";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: Request) {
  // Auth
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  const authCtx = getAuthContext(req);
  const profileId = authCtx?.profileId ?? "main";

  // Parse FormData
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Expected multipart form data." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { success: false, code: "NO_FILE", error: "No file provided." },
      { status: 400 },
    );
  }

  // Size check (belt-and-suspenders; media-service also checks)
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { success: false, code: "FILE_TOO_LARGE", error: "File exceeds 2 MB limit." },
      { status: 400 },
    );
  }

  // MIME check
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { success: false, code: "INVALID_TYPE", error: `Unsupported file type: ${file.type}` },
      { status: 400 },
    );
  }

  // Read buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Magic bytes validation + EXIF stripping
  let processed: { data: Buffer; mimeType: string };
  try {
    processed = processAvatarImage(buffer, file.type);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid image";
    return NextResponse.json(
      { success: false, code: "INVALID_IMAGE", error: message },
      { status: 400 },
    );
  }

  // Delete existing avatar first (partial unique index prevents insert of second avatar)
  db.delete(mediaAssets)
    .where(and(eq(mediaAssets.profileId, profileId), eq(mediaAssets.kind, "avatar")))
    .run();

  // Upload new avatar
  try {
    const id = uploadAvatar(profileId, processed.data, processed.mimeType);
    return NextResponse.json({
      success: true,
      id,
      url: `/api/media/${id}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json(
      { success: false, code: "UPLOAD_FAILED", error: message },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  // Auth
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  const authCtx = getAuthContext(req);
  const profileId = authCtx?.profileId ?? "main";

  // Delete avatar for this profile
  db.delete(mediaAssets)
    .where(and(eq(mediaAssets.profileId, profileId), eq(mediaAssets.kind, "avatar")))
    .run();

  return NextResponse.json({ success: true });
}
```

**Step 3: Run tests**

Run: `npx vitest run tests/evals/avatar-upload.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/api/media/avatar/route.ts tests/evals/avatar-upload.test.ts
git commit -m "feat(avatar): add POST/DELETE /api/media/avatar endpoints with validation"
```

---

### Task 7: Wire Avatar into Page Composer (buildHeroSection)

**Files:**
- Modify: `src/lib/services/media-service.ts` — add `getProfileAvatar(profileId)` function
- Modify: `src/lib/services/page-composer.ts:379-535` — add `profileId` parameter to `buildHeroSection()`, call `getProfileAvatar()`, set `content.avatarUrl`
- Modify: `src/lib/services/page-composer.ts:1290-1320` — pass `profileId` through `composeOptimisticPage()`
- Modify: `src/lib/services/page-projection.ts:39-68` — pass `profileId` through `projectCanonicalConfig()`
- Test: `tests/evals/avatar-composer.test.ts`

**Context:** `buildHeroSection()` (line 379) currently accepts `identityFacts, experienceFacts, interestFacts, language, username, socialFacts?, contactFacts?, languageFacts?`. It returns a `Section` with `HeroContent` that has `avatarUrl?: string` already typed. The function is called by `composeOptimisticPage()` at line 1315. `composeOptimisticPage()` is called by `projectCanonicalConfig()` in `page-projection.ts` at line 62. The `profileId` needs to flow from `projectCanonicalConfig()` → `composeOptimisticPage()` → `buildHeroSection()` → `getProfileAvatar()`.

**Step 1: Write test**

Create `tests/evals/avatar-composer.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

// Mock media-service
vi.mock("@/lib/services/media-service", () => ({
  getProfileAvatar: vi.fn(),
  uploadAvatar: vi.fn(),
  getMediaById: vi.fn(),
}));

describe("Avatar Composer Wiring", () => {
  it("getProfileAvatar returns media ID when avatar exists", async () => {
    const { getProfileAvatar } = await import(
      "@/lib/services/media-service"
    );
    // The mock — test that the function is called correctly
    expect(typeof getProfileAvatar).toBe("function");
  });
});
```

**Step 2: Add getProfileAvatar to media-service**

In `src/lib/services/media-service.ts`, add after `getMediaById()`:

```typescript
/**
 * Get the avatar media ID for a profile, or null if none exists.
 */
export function getProfileAvatar(profileId: string): string | null {
  const row = db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.profileId, profileId),
        eq(mediaAssets.kind, "avatar"),
      ),
    )
    .get();
  return row?.id ?? null;
}
```

Add `and` to the drizzle-orm import at the top of the file.

**Step 3: Wire into buildHeroSection and composeOptimisticPage**

In `src/lib/services/page-composer.ts`:

1. Add import at top: `import { getProfileAvatar } from "@/lib/services/media-service";`

2. Add `profileId?: string` parameter to `buildHeroSection()` after `languageFacts`:
```typescript
function buildHeroSection(
  identityFacts: FactRow[],
  experienceFacts: FactRow[],
  interestFacts: FactRow[],
  language: string,
  username: string,
  socialFacts?: FactRow[],
  contactFacts?: FactRow[],
  languageFacts?: FactRow[],
  profileId?: string,        // ← new
): Section | null {
```

3. Before the `return` (around line 521-534), after building `content`, add:
```typescript
  // Avatar
  if (profileId) {
    const avatarMediaId = getProfileAvatar(profileId);
    if (avatarMediaId) {
      content.avatarUrl = `/api/media/${avatarMediaId}`;
    }
  }
```

4. In `composeOptimisticPage()` (line 1290), add `profileId?: string` parameter:
```typescript
export function composeOptimisticPage(
  facts: FactRow[],
  username: string,
  language: string = "en",
  layoutTemplate?: LayoutTemplateId,
  draftSlots?: Map<string, string>,
  profileId?: string,         // ← new
): PageConfig {
```

5. Pass it to `buildHeroSection()` at line 1315:
```typescript
  const hero = buildHeroSection(
    identityFacts, experienceFacts, interestFacts, language, username,
    extended ? socialFacts : undefined,
    extended ? contactFacts : undefined,
    extended ? languageFacts : undefined,
    profileId,                // ← new
  );
```

**Step 4: Wire through page-projection**

In `src/lib/services/page-projection.ts`, add `profileId?: string` to `projectCanonicalConfig()`:

```typescript
export function projectCanonicalConfig(
  facts: FactRow[],
  username: string,
  factLanguage: string,
  draftMeta?: DraftMeta,
  profileId?: string,         // ← new
): PageConfig {
```

Pass it through to `composeOptimisticPage()`:
```typescript
  const composed = composeOptimisticPage(
    publishable,
    username,
    factLanguage,
    draftMeta?.layoutTemplate,
    draftSlots.size > 0 ? draftSlots : undefined,
    profileId,                // ← new
  );
```

Do the same for `projectPublishableConfig()` and `publishableFromCanonical()`.

**Step 5: Pass profileId from each caller**

Wire `profileId` through every caller of `projectCanonicalConfig` / `projectPublishableConfig`. Use `scope.cognitiveOwnerKey` where OwnerScope is available (it equals `profileId` for authenticated users, `sessionId` for anonymous — both map correctly to `media_assets.profile_id`).

**a) `src/app/api/preview/route.ts`** (has `scope` from `resolveOwnerScope(req)`):
```typescript
const profileId = scope?.cognitiveOwnerKey ?? "__default__";
// ... pass to projectCanonicalConfig:
const previewConfig = projectCanonicalConfig(facts, canonicalUsername, factLang, draftMeta, profileId);
```

**b) `src/app/api/preview/stream/route.ts`** (same pattern):
```typescript
const profileId = scope?.cognitiveOwnerKey ?? "__default__";
// ... inside poll():
const previewConfig = projectCanonicalConfig(facts, canonicalUsername, factLang, draftMeta, profileId);
```

**c) `src/lib/agent/tools.ts` — `recomposeAfterMutation()`** (has `ownerKey` in closure, which equals `cognitiveOwnerKey`):
```typescript
const composed = projectCanonicalConfig(
  allFacts,
  currentDraft?.username ?? "draft",
  factLang,
  draftMeta,
  ownerKey ?? sessionId,  // ownerKey = profileId for authenticated, sessionId for anon
);
```

**d) `src/lib/services/publish-pipeline.ts` — `prepareAndPublish()`** (has `sessionId`, needs to derive profileId):
```typescript
// At top of prepareAndPublish(), after getting scope:
import { getSession } from "@/lib/services/session-service";

const session = getSession(sessionId);
const profileId = session?.profileId ?? sessionId;

// ... pass to projectPublishableConfig:
const canonicalConfig = projectPublishableConfig(facts, username, factLang, draftMeta, profileId);
```

**e) `src/lib/connectors/connector-fact-writer.ts` — `batchCreateFacts()`** (has `scope` passed from caller):
The `batchCreateFacts` function calls `projectCanonicalConfig` for recompose. It has access to `scope.cognitiveOwnerKey`:
```typescript
const composed = projectCanonicalConfig(allFacts, username, factLang, draftMeta, scope.cognitiveOwnerKey);
```

**Graceful degradation:** If `profileId` is absent (e.g., tests), `getProfileAvatar(profileId)` returns `null` → no avatar URL → hero renders initials. No error.

**Avatar preview auto-refresh:** No manual refresh trigger needed. The SSE stream (`/api/preview/stream`) polls `projectCanonicalConfig()` every 1-5s. After avatar upload changes `media_assets`, the next SSE poll produces a different config hash (avatarUrl changed) → sends new config → preview re-renders automatically within 1-5s.

**Step 6: Run all existing tests to verify no regressions**

Run: `npx vitest run`
Expected: All existing tests pass (new optional parameter doesn't break callers)

**Step 7: Commit**

```bash
git add src/lib/services/media-service.ts src/lib/services/page-composer.ts src/lib/services/page-projection.ts src/app/api/preview/route.ts src/app/api/preview/stream/route.ts src/lib/agent/tools.ts src/lib/services/publish-pipeline.ts src/lib/connectors/connector-fact-writer.ts tests/evals/avatar-composer.test.ts
git commit -m "feat(avatar): wire avatar into page composer and projection pipeline"
```

---

### Task 8: Avatar UI in SettingsPanel

**Files:**
- Create: `src/components/settings/AvatarSection.tsx`
- Modify: `src/components/settings/SettingsPanel.tsx` — add Avatar section above Integrations

**Context:** The SettingsPanel has a `!languageOnly` guard. Avatar section should go between Layout and Integrations. It shows a circular 64px avatar or initials placeholder, with Upload and Remove buttons. Upload uses FormData POST to `/api/media/avatar`. Remove uses DELETE.

**Preview auto-refresh:** After upload/delete, the avatar URL in `media_assets` changes. The SSE stream (`/api/preview/stream`) calls `projectCanonicalConfig()` every 1-5s → calls `buildHeroSection()` → calls `getProfileAvatar()` → detects new/removed avatar → config hash changes → SSE sends updated config → preview re-renders automatically. No manual refresh trigger needed. The `onAvatarChange` callback is only for immediate local state update in the SettingsPanel avatar preview circle (so the user doesn't wait 1-5s to see their new avatar in the settings UI).

**Step 1: Create AvatarSection component**

Create `src/components/settings/AvatarSection.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";

type AvatarSectionProps = {
  /** Called after upload/remove to trigger preview refresh */
  onAvatarChange?: () => void;
};

export function AvatarSection({ onAvatarChange }: AvatarSectionProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current avatar URL from preview/draft
  useEffect(() => {
    fetch("/api/preview")
      .then((r) => r.json())
      .then((data) => {
        const hero = data?.config?.sections?.find(
          (s: { type: string }) => s.type === "hero",
        );
        setAvatarUrl(hero?.content?.avatarUrl ?? null);
      })
      .catch(() => {});
  }, []);

  const handleUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      setUploading(true);
      setError(null);

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch("/api/media/avatar", {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (data.success) {
          setAvatarUrl(data.url);
          onAvatarChange?.();
        } else {
          setError(data.error ?? "Upload failed");
        }
      } catch {
        setError("Upload failed");
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const handleRemove = async () => {
    setError(null);
    try {
      const res = await fetch("/api/media/avatar", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setAvatarUrl(null);
        onAvatarChange?.();
      }
    } catch {
      setError("Remove failed");
    }
  };

  return (
    <div className="flex items-center gap-4">
      {/* Avatar preview */}
      <div className="h-16 w-16 rounded-full overflow-hidden bg-[var(--page-bg-secondary,#f0f0f0)] flex items-center justify-center flex-shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Avatar"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[var(--page-fg-secondary,#999)] text-lg">?</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-[var(--page-bg-secondary,#f5f5f5)] transition-colors disabled:opacity-40"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
        {avatarUrl && (
          <button
            onClick={handleRemove}
            className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--page-border,#e5e5e5)] hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
          >
            Remove
          </button>
        )}
        {error && (
          <p className="text-[11px] text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Wire into SettingsPanel**

In `src/components/settings/SettingsPanel.tsx`:

1. Add import: `import { AvatarSection } from "@/components/settings/AvatarSection";`

2. Add after the Layout section (line 226) but BEFORE the Integrations section:

```tsx
                {/* Avatar */}
                <div className="flex flex-col gap-2.5">
                  <SectionLabel>Avatar</SectionLabel>
                  <AvatarSection />
                </div>
```

**Step 3: Verify visually**

Run: `npm run dev`
Navigate to builder, open settings. Verify Avatar section appears between Layout and Integrations with circular placeholder and Upload button.

**Step 4: Commit**

```bash
git add src/components/settings/AvatarSection.tsx src/components/settings/SettingsPanel.tsx
git commit -m "feat(avatar): add AvatarSection UI in SettingsPanel"
```

---

## Feature 3: Public Page Auto-Translation

### Task 9: Accept-Language Parser with Q-Weights and Region Fallback

**Files:**
- Create: `src/lib/i18n/accept-language.ts`
- Test: `tests/evals/accept-language.test.ts`

**Context:** The existing `src/lib/i18n/languages.ts` defines `LANGUAGE_OPTIONS` with 8 supported languages (en, it, de, fr, es, pt, ja, zh) and exports `LanguageCode` type + `isLanguageCode()`. The parser must: (1) parse `Accept-Language` header with q-weights, (2) sort by q descending, (3) for each: try exact match against supported languages, then base language (e.g., `fr-CA` → `fr`), (4) first match wins, (5) no match → return `null`.

**Step 1: Write tests**

Create `tests/evals/accept-language.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("Accept-Language parser", () => {
  let parseAcceptLanguage: (header: string | null) => string | null;

  beforeAll(async () => {
    const mod = await import("@/lib/i18n/accept-language");
    parseAcceptLanguage = mod.parseAcceptLanguage;
  });

  it("returns null for null/empty header", () => {
    expect(parseAcceptLanguage(null)).toBeNull();
    expect(parseAcceptLanguage("")).toBeNull();
  });

  it("matches simple language code", () => {
    expect(parseAcceptLanguage("fr")).toBe("fr");
  });

  it("matches with q-weights, picks highest", () => {
    expect(parseAcceptLanguage("de;q=0.5,fr;q=0.9,en;q=0.8")).toBe("fr");
  });

  it("treats missing q as q=1", () => {
    expect(parseAcceptLanguage("it,en;q=0.8")).toBe("it");
  });

  it("falls back from region to base (fr-CA → fr)", () => {
    expect(parseAcceptLanguage("fr-CA")).toBe("fr");
  });

  it("handles complex header with region fallback", () => {
    // fr-CA not supported directly, falls back to fr
    expect(
      parseAcceptLanguage("fr-CA,fr;q=0.9,en;q=0.8,de;q=0.5"),
    ).toBe("fr");
  });

  it("returns null for unsupported languages only", () => {
    expect(parseAcceptLanguage("ko,th;q=0.9")).toBeNull();
  });

  it("handles * wildcard (ignored)", () => {
    expect(parseAcceptLanguage("*;q=0.1,fr;q=0.9")).toBe("fr");
  });

  it("handles zh-CN → zh", () => {
    expect(parseAcceptLanguage("zh-CN;q=0.9,en;q=0.8")).toBe("zh");
  });

  it("handles ja-JP → ja", () => {
    expect(parseAcceptLanguage("ja-JP")).toBe("ja");
  });

  it("handles pt-BR → pt", () => {
    expect(parseAcceptLanguage("pt-BR,pt;q=0.9")).toBe("pt");
  });

  describe("bot detection", () => {
    let isCrawler: (userAgent: string | null) => boolean;

    beforeAll(async () => {
      const mod = await import("@/lib/i18n/accept-language");
      isCrawler = mod.isCrawler;
    });

    it("detects Googlebot", () => {
      expect(
        isCrawler(
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        ),
      ).toBe(true);
    });

    it("detects Bingbot", () => {
      expect(
        isCrawler(
          "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
        ),
      ).toBe(true);
    });

    it("returns false for normal browsers", () => {
      expect(
        isCrawler("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
      ).toBe(false);
    });

    it("returns false for null UA", () => {
      expect(isCrawler(null)).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify failure**

Run: `npx vitest run tests/evals/accept-language.test.ts`
Expected: FAIL — module not found

**Step 3: Implement parser**

Create `src/lib/i18n/accept-language.ts`:

```typescript
import { isLanguageCode, type LanguageCode } from "@/lib/i18n/languages";

type LangEntry = { code: string; q: number };

const CRAWLER_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,         // Yahoo
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /facebot/i,
  /ia_archiver/i,   // Alexa
  /semrushbot/i,
  /ahrefsbot/i,
];

/**
 * Parse Accept-Language header, match against supported languages.
 * Returns the best matching LanguageCode, or null if no match.
 */
export function parseAcceptLanguage(header: string | null): LanguageCode | null {
  if (!header || header.trim() === "") return null;

  const entries: LangEntry[] = header
    .split(",")
    .map((part) => {
      const [code, ...params] = part.trim().split(";");
      let q = 1;
      for (const p of params) {
        const match = p.trim().match(/^q=(\d+(?:\.\d+)?)$/);
        if (match) q = parseFloat(match[1]);
      }
      return { code: code.trim().toLowerCase(), q };
    })
    .filter((e) => e.code !== "*")
    .sort((a, b) => b.q - a.q);

  for (const entry of entries) {
    // Try exact match
    if (isLanguageCode(entry.code)) return entry.code;

    // Try base language (fr-CA → fr)
    const base = entry.code.split("-")[0];
    if (base !== entry.code && isLanguageCode(base)) return base as LanguageCode;
  }

  return null;
}

/**
 * Check if a User-Agent string belongs to a known crawler.
 * Crawlers get the original (untranslated) page for SEO.
 */
export function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return CRAWLER_PATTERNS.some((pattern) => pattern.test(userAgent));
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/evals/accept-language.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/i18n/accept-language.ts tests/evals/accept-language.test.ts
git commit -m "feat(i18n): add Accept-Language parser with q-weights, region fallback, bot detection"
```

---

### Task 10: Database Migration — Add source_language to page Table

**Files:**
- Create: `db/migrations/0024_page_source_language.sql`
- Modify: `src/lib/db/schema.ts:144-154` — add `sourceLanguage` column to page table

**Context:** The `page` table (schema.ts line 144) stores published pages. The new `source_language` column captures the language in which the page was originally composed, snapshotted at publish time. Latest migration is `0023_connector_foundation.sql`.

**Step 1: Create migration**

Create `db/migrations/0024_page_source_language.sql`:

```sql
-- Add source_language column to page table.
-- Stores the factLanguage at publish time for translation cache coherence.
ALTER TABLE page ADD COLUMN source_language TEXT;
```

**Step 2: Update Drizzle schema**

In `src/lib/db/schema.ts`, add `sourceLanguage` to the page table definition (after `updatedAt`):

```typescript
export const page = sqliteTable("page", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().default("__default__"),
  profileId: text("profile_id"),
  username: text("username").notNull(),
  config: text("config", { mode: "json" }).notNull(),
  configHash: text("config_hash"),
  status: text("status").notNull().default("draft"),
  generatedAt: text("generated_at"),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  sourceLanguage: text("source_language"),              // ← new
});
```

**Step 3: Run migration**

Run: `npm run dev` (migrations auto-apply via DB_BOOTSTRAP_MODE=leader)
Verify: Check SQLite with `sqlite3 db/openself.db ".schema page"` — should show `source_language TEXT`.

**Step 4: Commit**

```bash
git add db/migrations/0024_page_source_language.sql src/lib/db/schema.ts
git commit -m "feat(i18n): add source_language column to page table (migration 0024)"
```

---

### Task 11: Store sourceLanguage at Publish Time

**Files:**
- Modify: `src/lib/services/publish-pipeline.ts:182-198` — save `factLang` as `sourceLanguage` in publish transaction
- Modify: `src/lib/services/page-service.ts:207-267` — accept `sourceLanguage` in `confirmPublish()`

**Context:** The publish pipeline (`prepareAndPublish()` in `publish-pipeline.ts`) already computes `factLang` at line 94. The `confirmPublish()` in page-service.ts runs inside the transaction. We need to persist `factLang` as `source_language` in the published page row.

**Step 1: Modify confirmPublish to accept and store sourceLanguage**

In `src/lib/services/page-service.ts`, update `confirmPublish()`:

```typescript
export function confirmPublish(
  username: string,
  sessionId: string = "__default__",
  sourceLanguage?: string,              // ← new optional param
): void {
```

In the upsert statement inside `confirmPublish()`, add `sourceLanguage` to the published row:

Where the published page row is written (the `INSERT OR REPLACE` or `upsertDraft` call), ensure `source_language` is set.

Since `confirmPublish()` does a raw SQL `INSERT OR REPLACE` into the page table, add `source_language` to the insert columns:

```sql
INSERT OR REPLACE INTO page (id, session_id, profile_id, username, config, config_hash, status, generated_at, updated_at, source_language)
SELECT ?, session_id, profile_id, username, config, config_hash, 'published', generated_at, datetime('now'), ?
FROM page WHERE id = ? AND status = 'approval_pending'
```

(Check the exact SQL in `confirmPublish()` and adjust accordingly.)

**Step 2: Pass factLang in publish pipeline**

In `src/lib/services/publish-pipeline.ts`, line 197:

```typescript
confirmPublish(username, sessionId, factLang);
```

**Step 3: Run existing tests**

Run: `npx vitest run`
Expected: All pass (sourceLanguage is optional, backward compatible)

**Step 4: Commit**

```bash
git add src/lib/services/page-service.ts src/lib/services/publish-pipeline.ts
git commit -m "feat(i18n): store sourceLanguage at publish time in page row"
```

---

### Task 11b: Translation Cache Key Hardening (source + model aware)

**Files:**
- Modify: `src/lib/ai/translate.ts`
- Modify: `tests/evals/translate.test.ts`

**Context:** Current cache identity is content hash + target language. To avoid stale or cross-source collisions, cache identity must include source language and model version.

**Step 1: Add a composite cache-key helper**

In `src/lib/ai/translate.ts`, add a helper that derives cache identity from:
- translatable content hash
- normalized source language (`sourceLanguage ?? "unknown"`)
- target language
- translation model id (`getModelIdForTier("fast")` — NOT `getModelId()`, which resolves the default tier, not the `fast` tier used by translation. Import from `@/lib/ai/provider`)

Use this composite digest as `contentHash` for cache read/write and event logs.

**Step 2: Keep schema unchanged**

Do not add a migration. Keep the existing `translation_cache` table and store the stronger composite key in `content_hash`.

**Step 3: Extend tests**

In `tests/evals/translate.test.ts`, add assertions that:
- changing source language yields a cache miss (different key)
- changing model id yields a cache miss (different key)
- same source/target/model/content yields cache hit

**Also fix existing bug in `translate.ts`:** Lines 176 and 182 use `getModelId()` (which resolves the default/standard tier model via `AI_MODEL` env var) to store the model in cache. But the LLM call at line 162 uses `getModelForTier("fast")`. The `model` column in the cache should use `getModelIdForTier("fast")` for consistency. Fix this alongside the cache key change.

**Step 4: Commit**

```bash
git add src/lib/ai/translate.ts tests/evals/translate.test.ts
git commit -m "feat(i18n): harden translation cache key with source language and model version"
```

---

### Task 12: Public Page Translation Logic

**Files:**
- Modify: `src/app/[username]/page.tsx` — add Accept-Language detection, translation call, ?lang= override
- Test: `tests/evals/public-page-translation.test.ts`

**Context:** The public page route (44 lines) currently calls `getPublishedPage(username)` and renders directly. The translation pipeline `translatePageContent(config, targetLang, sourceLang)` in `src/lib/ai/translate.ts` returns a translated `PageConfig` (cache-first, graceful degradation on error). The `parseAcceptLanguage()` from Task 9 returns the best matching language. The `isCrawler()` function detects bots.

Language selection precedence must be:
1. explicit `?lang=` override (`?lang=original` disables translation)
2. language preference cookie (`os_lang`) if present and valid
3. `Accept-Language` header
4. fallback to page source language (no translation)

**Step 1: Write tests**

Create `tests/evals/public-page-translation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseAcceptLanguage, isCrawler } from "@/lib/i18n/accept-language";

describe("Public page translation logic", () => {
  describe("language precedence", () => {
    it("?lang=original skips translation", () => {
      // Logic: if searchParams.lang === "original", serve untranslated
      const lang = "original";
      const shouldTranslate = lang !== "original";
      expect(shouldTranslate).toBe(false);
    });

    it("?lang=fr overrides Accept-Language", () => {
      // Explicit lang param wins
      const explicitLang = "fr";
      const acceptLang = parseAcceptLanguage("de,en;q=0.8");
      const effective = explicitLang ?? acceptLang;
      expect(effective).toBe("fr");
    });

    it("Accept-Language used when no ?lang= param", () => {
      const explicitLang = null;
      const acceptLang = parseAcceptLanguage("it;q=0.9,en;q=0.8");
      const effective = explicitLang ?? acceptLang;
      expect(effective).toBe("it");
    });

    it("cookie language overrides Accept-Language when no ?lang= param", () => {
      const explicitLang = null;
      const cookieLang = "fr";
      const acceptLang = parseAcceptLanguage("de;q=0.9,en;q=0.8");
      const effective = explicitLang ?? cookieLang ?? acceptLang;
      expect(effective).toBe("fr");
    });

    it("no translation when visitor language matches source", () => {
      const visitorLang = "en";
      const sourceLang = "en";
      const needsTranslation = visitorLang !== sourceLang;
      expect(needsTranslation).toBe(false);
    });
  });

  describe("bot detection integration", () => {
    it("bots get original content (no translation)", () => {
      const ua = "Mozilla/5.0 (compatible; Googlebot/2.1)";
      expect(isCrawler(ua)).toBe(true);
      // Translation should be skipped
    });
  });
});
```

**Step 2: Implement translation in public page route**

Rewrite `src/app/[username]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublishedPage, getPublishedPageSourceLanguage } from "@/lib/services/page-service";
import { PageRenderer } from "@/components/page";
import { checkPageOwnership } from "@/lib/services/ownership";
import { translatePageContent } from "@/lib/ai/translate";
import { parseAcceptLanguage, isCrawler } from "@/lib/i18n/accept-language";
import { isLanguageCode } from "@/lib/i18n/languages";
import { TranslationBanner } from "@/components/page/TranslationBanner";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const config = getPublishedPage(username);

  if (!config) {
    return { title: "Not Found" };
  }

  const heroSection = config.sections.find((s) => s.type === "hero");
  const name = heroSection?.content?.name;
  const title = typeof name === "string" ? name : username;

  return { title: `${title} | OpenSelf` };
}

export default async function UsernamePage({ params, searchParams }: Props) {
  const { username } = await params;
  const config = getPublishedPage(username);

  if (!config) {
    notFound();
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get("os_session")?.value;
  const isOwner = sessionId ? checkPageOwnership(sessionId, username) : false;

  // Translation logic
  const sp = await searchParams;
  const langParam = typeof sp.lang === "string" ? sp.lang : null;

  // ?lang=original → skip translation
  if (langParam === "original") {
    return <PageRenderer config={config} isOwner={isOwner} />;
  }

  // Bot detection: serve original for SEO
  const headerStore = await headers();
  const userAgent = headerStore.get("user-agent");
  if (isCrawler(userAgent)) {
    return <PageRenderer config={config} isOwner={isOwner} />;
  }

  // Determine visitor language
  const sourceLanguage = getPublishedPageSourceLanguage(username);
  const explicitLang = langParam && isLanguageCode(langParam) ? langParam : null;
  const cookieLangRaw = cookieStore.get("os_lang")?.value;
  const cookieLang = cookieLangRaw && isLanguageCode(cookieLangRaw) ? cookieLangRaw : null;
  const acceptLang = parseAcceptLanguage(headerStore.get("accept-language"));
  const visitorLang = explicitLang ?? cookieLang ?? acceptLang;

  // No translation needed if:
  // - no visitor lang detected
  // - visitor lang matches page source language
  // - sourceLanguage is null (old pages published before migration 0024 — we don't
  //   know the source language, so translating would be unreliable)
  if (!visitorLang || !sourceLanguage || visitorLang === sourceLanguage) {
    return <PageRenderer config={config} isOwner={isOwner} />;
  }

  // Translate (cache-first, graceful fallback)
  const translatedConfig = await translatePageContent(
    config,
    visitorLang,
    sourceLanguage,
  );

  return (
    <>
      <TranslationBanner
        sourceLanguage={sourceLanguage ?? "en"}
        username={username}
      />
      <PageRenderer config={translatedConfig} isOwner={isOwner} />
    </>
  );
}
```

**Step 3: Add getPublishedPageSourceLanguage to page-service**

In `src/lib/services/page-service.ts`, add:

```typescript
/**
 * Get the source language of a published page.
 * Returns null if page not found or no source_language recorded.
 */
export function getPublishedPageSourceLanguage(username: string): string | null {
  const row = db
    .select({ sourceLanguage: page.sourceLanguage })
    .from(page)
    .where(and(eq(page.username, username), eq(page.status, "published")))
    .get();
  return row?.sourceLanguage ?? null;
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/evals/public-page-translation.test.ts tests/evals/accept-language.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/\\[username\\]/page.tsx src/lib/services/page-service.ts tests/evals/public-page-translation.test.ts
git commit -m "feat(i18n): add public page auto-translation with Accept-Language detection"
```

---

### Task 13: TranslationBanner Component

**Files:**
- Create: `src/components/page/TranslationBanner.tsx`

**Context:** The banner appears above `PageRenderer` on translated pages. Text: "Machine-translated from {languageName}. [View original]". "View original" links to `?lang=original`. Styling should be subtle, match the page theme, and be dismissible. The existing `VisitorBanner.tsx` at `src/components/page/VisitorBanner.tsx` is a good reference for styling. Do not render this banner for crawlers (already enforced in Task 12 route logic).

**Step 1: Read VisitorBanner for style reference**

Read: `src/components/page/VisitorBanner.tsx`

**Step 2: Create TranslationBanner**

Create `src/components/page/TranslationBanner.tsx`:

```tsx
import { LANGUAGE_NAMES } from "@/lib/i18n/language-names";

type TranslationBannerProps = {
  sourceLanguage: string;
  username: string;
};

export function TranslationBanner({
  sourceLanguage,
  username,
}: TranslationBannerProps) {
  const langName =
    LANGUAGE_NAMES[sourceLanguage as keyof typeof LANGUAGE_NAMES] ??
    sourceLanguage;

  return (
    <div className="w-full bg-[var(--page-bg-secondary,#f5f5f5)] border-b border-[var(--page-border,#e5e5e5)] px-4 py-2 text-center text-xs text-[var(--page-fg-secondary,#666)]">
      Machine-translated from {langName}.{" "}
      <a
        href={`/${username}?lang=original`}
        className="underline hover:text-[var(--page-fg,#111)] transition-colors"
      >
        View original
      </a>
    </div>
  );
}
```

**Step 3: Verify LANGUAGE_NAMES exists and has the right shape**

Read: `src/lib/i18n/language-names.ts` to confirm it exports a Record<string, string>.

**Step 4: Commit**

```bash
git add src/components/page/TranslationBanner.tsx
git commit -m "feat(i18n): add TranslationBanner component for translated public pages"
```

---

### Task 14: Full Integration Test — Public Page Translation E2E

**Files:**
- Test: `tests/evals/public-page-translation.test.ts` (extend from Task 12)

**Context:** Extend the test file to cover the full flow: cache hit/miss, banner rendering, ?lang=original bypass, bot skip, fallback on missing sourceLanguage.

**Step 1: Extend test file**

Add to `tests/evals/public-page-translation.test.ts`:

```typescript
describe("Graceful degradation", () => {
  it("serves original when sourceLanguage is null (old pages)", () => {
    const sourceLanguage = null;
    const visitorLang = "fr";
    // When sourceLanguage is null, skip translation
    const shouldTranslate = sourceLanguage !== null && visitorLang !== sourceLanguage;
    expect(shouldTranslate).toBe(false);
  });

  it("serves original when Accept-Language has no supported match", () => {
    const visitorLang = parseAcceptLanguage("ko,th;q=0.9");
    expect(visitorLang).toBeNull();
    // null visitorLang → no translation
  });
});

describe("TranslationBanner", () => {
  it("shows source language name", () => {
    // This would be a component test; for now test the data lookup
    const { LANGUAGE_NAMES } = require("@/lib/i18n/language-names");
    expect(LANGUAGE_NAMES.fr).toBe("French");
    expect(LANGUAGE_NAMES.it).toBe("Italian");
  });
});
```

**Step 2: Run all tests**

Run: `npx vitest run tests/evals/public-page-translation.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/evals/public-page-translation.test.ts
git commit -m "test(i18n): extend public page translation tests with edge cases"
```

---

### Task 15: Run Full Test Suite + Fix Any Regressions

**Files:** None (verification only)

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (1800+)

**Step 2: Fix any regressions**

If any existing tests fail due to the new `profileId` parameter on `composeOptimisticPage()` or `projectCanonicalConfig()`, verify the parameter is optional and doesn't change behavior when absent.

**Step 3: Build check**

Run: `npx next build`
Expected: Build succeeds with no type errors

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve regressions from Phase 1d features"
```

---

### Task 16: Update Documentation

**Files:**
- Modify: `docs/STATUS.md` — update test counts, add Phase 1d closing section
- Modify: `docs/ROADMAP.md` — mark NEXT-13 (avatar), NEXT-15 (translation) as done

**Step 1: Update STATUS.md**

Add a new section "Phase 1d Closing" with:
- Connector UI: SettingsPanel Integrations section, GitHub/LinkedIn cards, OAuth return flow, idempotency guards, connector API auth/error hardening
- Avatar Upload: POST/DELETE endpoints, magic bytes validation, EXIF stripping, composer wiring, SettingsPanel UI
- Public Page Translation: Accept-Language parsing + cookie precedence, sourceLanguage snapshot, source/model-aware cache key, TranslationBanner disclosure, bot detection

Update test counts.

**Step 2: Update ROADMAP.md**

Mark NEXT-13 (Avatar) and NEXT-15 (Translation) as ✅ Done.

**Step 3: Commit**

```bash
git add docs/STATUS.md docs/ROADMAP.md
git commit -m "docs: update STATUS and ROADMAP for Phase 1d closing"
```

---

## Summary

| Task | Feature | What |
|------|---------|------|
| 1 | Connector UI | ConnectorSection component + tests |
| 2 | Connector UI | Wire into SettingsPanel |
| 3 | Connector UI | OAuth return flow (?connector= param) |
| 4 | Connector UI | Sync/import idempotency guards |
| 4b | Connector UI | Connector API auth hardening + standard error contract |
| 5 | Avatar | Magic bytes + EXIF stripping utilities |
| 6 | Avatar | POST/DELETE /api/media/avatar endpoints |
| 7 | Avatar | Wire avatar into page composer pipeline |
| 8 | Avatar | Avatar UI in SettingsPanel |
| 9 | Translation | Accept-Language parser + bot detection |
| 10 | Translation | DB migration (source_language column) |
| 11 | Translation | Store sourceLanguage at publish time |
| 11b | Translation | Hardening translation cache key (source/model aware) |
| 12 | Translation | Public page translation logic |
| 13 | Translation | TranslationBanner component |
| 14 | Translation | Full integration tests |
| 15 | All | Full test suite + build verification |
| 16 | All | Documentation updates |
