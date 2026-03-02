# Connector Implementation Plan (GitHub + LinkedIn ZIP)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete all 4 connector milestones — fix Milestone A gaps, implement GitHub connector (OAuth + sync), LinkedIn ZIP connector (upload + parse + import), and hardening.

**Architecture:** Two connectors sharing the existing foundation (registry, connector-service, connector-fact-writer, encrypted credentials, sync_log). GitHub uses dedicated connector OAuth + periodic worker sync. LinkedIn ZIP uses one-shot multipart upload + batch import. Both write facts via `batchCreateFacts()` with `actor: "connector"`.

**Tech Stack:** Next.js App Router, arctic (OAuth), node:crypto (encryption), csv-parse (CSV), yauzl-promise (ZIP), vitest (tests)

**Design reference:** `docs/plans/2026-03-01-connectors-github-linkedin-design.md`

### Review Findings Applied

| # | Severity | Fix |
|---|----------|-----|
| 1a | CRITICO | Job enqueue uses `enqueueJob()` helper (not raw insert) — handles `runAfter`, dedup |
| 1b | CRITICO | Connector OAuth callback at `/api/auth/github/callback/connector` (subdirectory of registered callback URL — GitHub validates subdirectory match). Single GitHub App, one registered callback URL. |
| 1c | MEDIO | `NEXT_PUBLIC_BASE_URL` required in production — connect route throws early if missing (no silent fallback to localhost) |
| 2 | CRITICO | Token read via `connector.decryptedCredentials` (not `credentials`) |
| 3 | ALTO | `syncGitHub` updates `connectors.lastSync` + `syncCursor` after successful sync |
| 4 | ALTO | `EXCLUDE_FILES` stores lowercase names; comparison uses `filename.toLowerCase()` on both sides |
| 5 | ALTO | ZIP reader wrapped in `try/finally` with explicit close |
| 6 | ALTO | `importLinkedInZip` catches `yauzl.fromBuffer` errors → returns error report |
| 7 | MEDIO | Email validation: `private-contact` always validates emailFields (no `type === "email"` gate); mapper adds `type: "email"` for contact facts |
| 8 | MEDIO | E2E GitHub test calls `handleConnectorSync` (not `syncGitHub`) to verify full sync_log path |
| 9 | MEDIO | `syncGitHub` resolves existing draft username; falls back to `profile.login` only if no draft exists |
| 10 | MEDIO | All new API routes use `{ success: false, code, error }` pattern matching existing connector routes |

### Design Decisions

- **LinkedIn import**: Synchronous in request (MVP — ~30-60 facts, <5s). Async with progress endpoint deferred post-MVP.
- **Manual sync**: Fan-out by `ownerKey` (matches dedup index `uniq_jobs_dedup(job_type, json_extract(payload, '$.ownerKey'))`).

### Post-Implementation Verification (non-blocking)

**V1: OAuth subdirectory smoke test**
After Task 6 is deployed, manually test the GitHub connector OAuth redirect to confirm GitHub accepts `/api/auth/github/callback/connector` as a valid subdirectory of the registered callback URL. If GitHub rejects it (`redirect_uri_mismatch`), fallback plan: merge both flows into the existing callback route with cookie-based dispatch (`gh_connector_flow` cookie set by connect route, checked in callback).

**V2: NEXT_PUBLIC_BASE_URL in all environments**
Currently missing from `.env` (local dev) and Coolify (production). Must be set before connector OAuth works:
- `.env` (local): `NEXT_PUBLIC_BASE_URL=http://localhost:3000`
- Coolify web app `cokksgw48goscs8okgk48okw`: `NEXT_PUBLIC_BASE_URL=https://openself.dev`
- Also needed: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `CONNECTOR_ENCRYPTION_KEY` (32 bytes hex)

Task 6 implementation includes an explicit null-return (no silent fallback) if `NEXT_PUBLIC_BASE_URL` is unset. The login routes still use their own `?? "http://localhost:3000"` fallback — we don't touch those.

---

## Task 1: Fix Milestone A — Sync Handler Dispatch Hook

**Files:**
- Modify: `src/lib/connectors/connector-sync-handler.ts`
- Modify: `src/lib/connectors/types.ts`
- Test: `tests/evals/connector-sync-handler.test.ts`

**Context:** The sync handler has a no-op placeholder where dispatch should happen. We need to add a `syncFn` to `ConnectorDefinition` so registered connectors can actually execute.

**Step 1: Update ConnectorDefinition type**

In `src/lib/connectors/types.ts`, add a `syncFn` field:

```typescript
export type ConnectorDefinition = {
  type: string;
  displayName: string;
  supportsSync: boolean;
  supportsImport: boolean;
  syncFn?: (connectorId: string, ownerKey: string) => Promise<SyncResult>;
};

export type SyncResult = {
  factsCreated: number;
  factsUpdated: number;
  error?: string;
};
```

**Step 2: Update sync handler to call syncFn**

In `connector-sync-handler.ts`, replace the no-op placeholder (lines 58-60) with actual dispatch:

```typescript
if (!def.supportsSync || !def.syncFn) {
  insertSyncLog(connector.id, "partial", 0, 0, "no sync implementation");
  continue;
}

const result = await def.syncFn(connector.id, ownerKey);
insertSyncLog(
  connector.id,
  result.error ? "error" : "success",
  result.factsCreated,
  result.factsUpdated,
  result.error ?? null,
);

if (result.error) {
  updateConnectorStatus(connector.id, "error", result.error);
} else {
  updateConnectorStatus(connector.id, "connected");
}
```

**Step 3: Update existing tests + add dispatch test**

Add a test in `connector-sync-handler.test.ts` that registers a connector with a `syncFn` mock and verifies it gets called during sync.

**Step 4: Run tests**

Run: `npx vitest run tests/evals/connector-sync-handler.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
feat(connectors): add syncFn dispatch to sync handler
```

---

## Task 2: Connector Registration & Startup Wiring

**Files:**
- Create: `src/lib/connectors/github/definition.ts`
- Create: `src/lib/connectors/linkedin-zip/definition.ts`
- Create: `src/lib/connectors/register-all.ts`
- Modify: `src/lib/worker/index.ts` (import register-all)
- Test: `tests/evals/connector-registration.test.ts`

**Context:** The registry exists but is empty. Each connector needs a definition. We also need a single `register-all.ts` that's imported at startup.

**Step 1: Write the test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { getConnector } from "@/lib/connectors/registry";

// FIX review #4: top-level import (not require()) triggers registration as ESM side-effect
import "@/lib/connectors/register-all";

describe("connector registration", () => {
  it("registers github connector with sync support", () => {
    const gh = getConnector("github");
    expect(gh).toBeDefined();
    expect(gh!.type).toBe("github");
    expect(gh!.supportsSync).toBe(true);
    expect(gh!.supportsImport).toBe(false);
  });

  it("registers linkedin_zip connector with import support", () => {
    const li = getConnector("linkedin_zip");
    expect(li).toBeDefined();
    expect(li!.type).toBe("linkedin_zip");
    expect(li!.supportsSync).toBe(false);
    expect(li!.supportsImport).toBe(true);
  });

  // FIX review #4: no hard toHaveLength — just verify our two are present
});
```

**Step 2: Create github definition**

`src/lib/connectors/github/definition.ts`:
```typescript
import type { ConnectorDefinition } from "../types";

export const githubDefinition: ConnectorDefinition = {
  type: "github",
  displayName: "GitHub",
  supportsSync: true,
  supportsImport: false,
  // syncFn will be set in Task 5 after client/mapper exist
};
```

**Step 3: Create linkedin-zip definition**

`src/lib/connectors/linkedin-zip/definition.ts`:
```typescript
import type { ConnectorDefinition } from "../types";

export const linkedinZipDefinition: ConnectorDefinition = {
  type: "linkedin_zip",
  displayName: "LinkedIn (ZIP Export)",
  supportsSync: false,
  supportsImport: true,
};
```

**Step 4: Create register-all.ts**

`src/lib/connectors/register-all.ts`:
```typescript
import { registerConnector } from "./registry";
import { githubDefinition } from "./github/definition";
import { linkedinZipDefinition } from "./linkedin-zip/definition";

registerConnector(githubDefinition);
registerConnector(linkedinZipDefinition);
```

**Step 5: Import in worker**

Add `import "@/lib/connectors/register-all";` at the top of `src/lib/worker/index.ts`.

**Step 6: Run tests, commit**

```
feat(connectors): register github + linkedin_zip definitions
```

---

## Task 3: GitHub API Client

**Files:**
- Create: `src/lib/connectors/github/client.ts`
- Test: `tests/evals/github-client.test.ts`

**Context:** Thin client wrapping `fetch` with auth headers, ETag support, 401 detection, rate-limit awareness.

**Step 1: Write tests**

Test cases:
- `fetchProfile()` returns parsed user data
- `fetchRepos()` returns array of repos (paginated)
- `fetchRepoLanguages(owner, repo)` returns language map
- 401 response throws `GitHubAuthError`
- 304 Not Modified returns `null` (cached, no change)
- Rate limit header logged as warning

Use `vi.fn()` to mock global `fetch`.

**Step 2: Implement client**

```typescript
export class GitHubAuthError extends Error {
  constructor() { super("GitHub token expired or revoked"); }
}

export type GitHubProfile = {
  login: string;
  html_url: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  twitter_username: string | null;
  name: string | null;
};

export type GitHubRepo = {
  node_id: string;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  archived: boolean;
  fork: boolean;
  pushed_at: string;
  stargazers_count: number;
};

export async function fetchProfile(token: string): Promise<GitHubProfile> { ... }
export async function fetchRepos(token: string): Promise<GitHubRepo[]> { ... }
export async function fetchRepoLanguages(token: string, owner: string, repo: string): Promise<Record<string, number>> { ... }
```

Key implementation details:
- All requests include `Authorization: Bearer ${token}` and `Accept: application/vnd.github+json`
- `fetchRepos` paginates via `Link` header (max 100 per page, `?type=public&per_page=100`)
- 401 → throw `GitHubAuthError`
- Log `X-RateLimit-Remaining` when < 100

**Step 3: Run tests, commit**

```
feat(connectors): add GitHub API client with auth + pagination
```

---

## Task 4: GitHub Fact Mapper

**Files:**
- Create: `src/lib/connectors/github/mapper.ts`
- Test: `tests/evals/github-mapper.test.ts`

**Context:** Maps GitHub API responses to `FactInput[]` following design section 4.5.

**Step 1: Write tests**

Test cases:
- `mapProfile()` — maps login/bio/company/location/blog/twitter to correct fact categories/keys
- `mapProfile()` — skips null/empty fields
- `mapRepos()` — maps each repo to `project/gh-<node_id>` fact
- `mapRepos()` — skips forks
- `mapRepos()` — aggregates languages into `skill/<lang>` facts
- `mapRepos()` — creates `stat/github-repos` fact with count
- `mapRepos()` — marks archived repos as `status: "archived"`

**Step 2: Implement mapper**

```typescript
import type { GitHubProfile, GitHubRepo } from "./client";

type FactInput = {
  category: string;
  key: string;
  value: Record<string, unknown>;
};

export function mapProfile(profile: GitHubProfile): FactInput[] {
  const facts: FactInput[] = [];

  facts.push({
    category: "social",
    key: "gh-profile",
    value: { platform: "github", url: profile.html_url, username: profile.login },
  });

  if (profile.bio) {
    facts.push({ category: "identity", key: "gh-bio", value: { text: profile.bio } });
  }
  if (profile.company) {
    facts.push({ category: "identity", key: "gh-company", value: { value: profile.company } });
  }
  if (profile.location) {
    facts.push({ category: "identity", key: "gh-location", value: { city: profile.location } });
  }
  if (profile.blog) {
    const url = profile.blog.startsWith("http") ? profile.blog : `https://${profile.blog}`;
    facts.push({ category: "social", key: "gh-website", value: { url } });
  }
  if (profile.twitter_username) {
    facts.push({
      category: "social",
      key: "gh-twitter",
      value: { platform: "twitter", username: profile.twitter_username },
    });
  }

  return facts;
}

export function mapRepos(
  repos: GitHubRepo[],
  languagesByRepo: Map<string, Record<string, number>>,
): FactInput[] {
  const facts: FactInput[] = [];
  const nonForkRepos = repos.filter((r) => !r.fork);

  // Per-repo project facts
  for (const repo of nonForkRepos) {
    const languages = languagesByRepo.get(repo.full_name);
    const tags = languages ? Object.keys(languages) : repo.language ? [repo.language] : [];

    facts.push({
      category: "project",
      key: `gh-${repo.node_id}`,
      value: {
        name: repo.name,
        description: repo.description ?? "",
        url: repo.html_url,
        tags,
        status: repo.archived ? "archived" : "active",
      },
    });
  }

  // Aggregated language skills
  const langTotals = new Map<string, number>();
  for (const repo of nonForkRepos) {
    const langs = languagesByRepo.get(repo.full_name) ?? {};
    for (const lang of Object.keys(langs)) {
      langTotals.set(lang, (langTotals.get(lang) ?? 0) + 1);
    }
  }
  for (const [lang, count] of langTotals) {
    facts.push({
      category: "skill",
      key: `gh-${lang.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      value: { name: lang, evidence: `${count} repositories` },
    });
  }

  // Repo count stat
  facts.push({
    category: "stat",
    key: "github-repos",
    value: { label: "GitHub repositories", value: String(nonForkRepos.length) },
  });

  return facts;
}
```

**Step 3: Run tests, commit**

```
feat(connectors): add GitHub fact mapper (profile + repos + skills)
```

---

## Task 5: GitHub Initial Sync

**Files:**
- Create: `src/lib/connectors/github/sync.ts`
- Modify: `src/lib/connectors/github/definition.ts` (wire syncFn)
- Test: `tests/evals/github-sync.test.ts`

**Context:** Orchestrates a full sync: fetch profile + repos + languages → map to facts → batch write. Updates `connector_items` for provenance. Uses `getConnectorWithCredentials()` to get the encrypted token.

**Step 1: Write tests**

Test cases:
- `syncGitHub(connectorId, ownerKey)` — fetches profile + repos, maps, writes via batchCreateFacts
- Records provenance in `connector_items` for each repo
- Handles `GitHubAuthError` — marks connector status="error"
- Updates `syncCursor` with latest `pushed_at` timestamp
- Returns `SyncResult` with correct counts

Mock: `fetch`, `connector-service.getConnectorWithCredentials`, `connector-fact-writer.batchCreateFacts`

**Step 2: Implement sync**

```typescript
import { getConnectorWithCredentials, updateConnectorStatus } from "../connector-service";
import { batchCreateFacts } from "../connector-fact-writer";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getDraft } from "@/lib/services/page-service";
import { fetchProfile, fetchRepos, fetchRepoLanguages, GitHubAuthError } from "./client";
import { mapProfile, mapRepos } from "./mapper";
import type { SyncResult } from "../types";
import { db } from "@/lib/db";
import { connectors, connectorItems } from "@/lib/db/schema";
import { randomUUID } from "node:crypto";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { eq } from "drizzle-orm";

export async function syncGitHub(connectorId: string, ownerKey: string): Promise<SyncResult> {
  const connector = getConnectorWithCredentials(connectorId);
  if (!connector?.decryptedCredentials) {
    return { factsCreated: 0, factsUpdated: 0, error: "No credentials" };
  }

  // FIX #2: decryptedCredentials is the decrypted field (not credentials which is still ciphertext)
  const creds = typeof connector.decryptedCredentials === "string"
    ? JSON.parse(connector.decryptedCredentials)
    : connector.decryptedCredentials;
  const token = creds.access_token as string;

  const scope = resolveOwnerScopeForWorker(ownerKey);
  const factLanguage = getFactLanguage(scope.knowledgePrimaryKey) ?? "en";

  // FIX #9: Use existing draft username if available, fall back to GitHub login
  const existingDraft = getDraft(scope.knowledgePrimaryKey);

  try {
    const profile = await fetchProfile(token);
    const repos = await fetchRepos(token);

    // Fetch languages for top repos (limit to 30 to stay within rate limits)
    const topRepos = repos.filter(r => !r.fork).slice(0, 30);
    const languagesByRepo = new Map<string, Record<string, number>>();
    for (const repo of topRepos) {
      const langs = await fetchRepoLanguages(token, repo.full_name.split("/")[0], repo.name);
      if (langs) languagesByRepo.set(repo.full_name, langs);
    }

    const profileFacts = mapProfile(profile);
    const repoFacts = mapRepos(repos, languagesByRepo);
    const allFacts = [...profileFacts, ...repoFacts];

    const username = existingDraft?.username ?? profile.login;
    const report = await batchCreateFacts(allFacts, scope, username, factLanguage);

    // Record provenance for repos
    for (const repo of repos.filter(r => !r.fork)) {
      db.insert(connectorItems)
        .values({
          id: randomUUID(),
          connectorId,
          externalId: repo.node_id,
          externalHash: repo.pushed_at,
          factId: null, // We don't track fact IDs 1:1 in MVP
        })
        .onConflictDoUpdate({
          target: [connectorItems.connectorId, connectorItems.externalId],
          set: { externalHash: repo.pushed_at, lastSeenAt: new Date().toISOString() },
        })
        .run();
    }

    // FIX #3: Update lastSync + syncCursor after successful sync
    const latestPushedAt = repos
      .filter(r => !r.fork)
      .map(r => r.pushed_at)
      .sort()
      .pop();

    db.update(connectors)
      .set({
        lastSync: new Date().toISOString(),
        syncCursor: latestPushedAt ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(connectors.id, connectorId))
      .run();

    return { factsCreated: report.factsWritten, factsUpdated: 0 };
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      updateConnectorStatus(connectorId, "error", "Token expired or revoked");
      return { factsCreated: 0, factsUpdated: 0, error: "Token expired or revoked — reconnect required" };
    }
    throw error;
  }
}
```

**Step 3: Wire syncFn into definition**

Update `src/lib/connectors/github/definition.ts`:
```typescript
import { syncGitHub } from "./sync";

export const githubDefinition: ConnectorDefinition = {
  type: "github",
  displayName: "GitHub",
  supportsSync: true,
  supportsImport: false,
  syncFn: syncGitHub,
};
```

**Step 4: Run tests, commit**

```
feat(connectors): implement GitHub initial sync (profile + repos → facts)
```

---

## Task 6: GitHub Connector OAuth (Dedicated Flow)

**Files:**
- Create: `src/app/api/connectors/github/connect/route.ts`
- Create: `src/app/api/auth/github/callback/connector/route.ts`
- Test: `tests/evals/github-connector-oauth.test.ts`

**Context:** This is a SEPARATE OAuth flow from login. Login creates a session. Connector OAuth stores the token encrypted for ongoing API access. Scopes differ: login uses `user:email`, connector uses `read:user`.

**OAuth routing strategy (FIX review #1b):**
- GitHub OAuth Apps support ONE registered callback URL, but accept any subdirectory of that URL as a valid `redirect_uri`.
- Registered callback URL in GitHub App: `${BASE_URL}/api/auth/github/callback`
- Login flow: `redirect_uri` = `${BASE_URL}/api/auth/github/callback` (exact match ✅)
- Connector flow: `redirect_uri` = `${BASE_URL}/api/auth/github/callback/connector` (subdirectory ✅)
- See: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps ("The redirect URL's path must reference a subdirectory of the callback URL.")

**Step 1: Write test**

Test cases:
- GET `/api/connectors/github/connect` — redirects to GitHub with `read:user` scope and `redirect_uri` ending in `/callback/connector`
- GET `/api/connectors/github/connect` — requires auth (403 if no session)
- GET `/api/connectors/github/connect` — throws if `NEXT_PUBLIC_BASE_URL` is not set (no silent localhost fallback in production)
- GET `/api/auth/github/callback/connector` — validates state, exchanges code, stores encrypted token
- GET `/api/auth/github/callback/connector` — creates connector row via `createConnector()`
- GET `/api/auth/github/callback/connector` — enqueues initial sync job

**Step 2: Implement connect route**

`src/app/api/connectors/github/connect/route.ts`:
```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GitHub, generateState } from "arctic";
import { resolveOwnerScope } from "@/lib/auth/session";

// FIX review #1b: redirect_uri is a subdirectory of the registered callback URL.
// Registered in GitHub App: ${BASE_URL}/api/auth/github/callback
// Connector uses:           ${BASE_URL}/api/auth/github/callback/connector
function getConnectorGitHubClient(): GitHub | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // FIX review #1c: No silent fallback to localhost in production
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) {
    console.error("[github-connector] NEXT_PUBLIC_BASE_URL is not set");
    return null;
  }

  return new GitHub(clientId, clientSecret, `${baseUrl}/api/auth/github/callback/connector`);
}

export async function GET(req: NextRequest) {
  const scope = resolveOwnerScope(req);
  if (!scope) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  const github = getConnectorGitHubClient();
  if (!github) {
    return NextResponse.json(
      { success: false, code: "NOT_CONFIGURED", error: "GitHub OAuth not configured." },
      { status: 404 },
    );
  }

  const state = generateState();
  const url = github.createAuthorizationURL(state, ["read:user"]);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set("gh_connector_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
```

**Step 3: Implement connector callback route**

`src/app/api/auth/github/callback/connector/route.ts`:
```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GitHub } from "arctic";
import { resolveOwnerScope } from "@/lib/auth/session";
import { createConnector } from "@/lib/connectors/connector-service";
import { enqueueJob } from "@/lib/worker";

// Must match the redirectURI used in the connect route
function getConnectorGitHubClient(): GitHub | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) return null;

  return new GitHub(clientId, clientSecret, `${baseUrl}/api/auth/github/callback/connector`);
}

export async function GET(req: NextRequest) {
  const scope = resolveOwnerScope(req);
  if (!scope) {
    return NextResponse.redirect(new URL("/builder?error=auth_required", req.url));
  }

  const github = getConnectorGitHubClient();
  if (!github) {
    return NextResponse.redirect(new URL("/builder?error=oauth_not_configured", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("gh_connector_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/builder?error=invalid_state", req.url));
  }

  try {
    const tokens = await github.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();

    const ownerKey = scope.cognitiveOwnerKey;

    // Store encrypted token + create connector row
    await createConnector(ownerKey, "github", { access_token: accessToken }, {});

    // Enqueue initial sync
    enqueueJob("connector_sync", { ownerKey });

    const response = NextResponse.redirect(new URL("/builder?connector=github_connected", req.url));
    response.cookies.delete("gh_connector_state");
    return response;
  } catch (error) {
    console.error("[github-connector-oauth] Callback error:", error);
    return NextResponse.redirect(new URL("/builder?error=github_connect_failed", req.url));
  }
}
```

**Step 4: Run tests, commit**

```
feat(connectors): add dedicated GitHub connector OAuth flow
```

---

## Task 7: GitHub Manual Sync API Route

**Files:**
- Create: `src/app/api/connectors/github/sync/route.ts`
- Test: `tests/evals/github-connector-api.test.ts`

**Context:** "Sync now" button in UI triggers this. Enqueues a `connector_sync` worker job.

**Step 1: Implement route**

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { getConnectorStatus } from "@/lib/connectors/connector-service";
import { enqueueJob } from "@/lib/worker";

export async function POST(req: NextRequest) {
  const scope = resolveOwnerScope(req);
  if (!scope) {
    // FIX #10: Match existing connector route error contract
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  const ownerKey = scope.cognitiveOwnerKey;
  const connectors = getConnectorStatus(ownerKey);
  const github = connectors.find(c => c.connectorType === "github" && c.status === "connected");

  if (!github) {
    return NextResponse.json(
      { success: false, code: "NOT_CONNECTED", error: "GitHub not connected." },
      { status: 404 },
    );
  }

  // FIX #1: Use enqueueJob() helper
  enqueueJob("connector_sync", { ownerKey });

  return NextResponse.json({ success: true, message: "Sync queued" });
}
```

**Step 2: Write test, run, commit**

```
feat(connectors): add manual GitHub sync API route
```

---

## Task 8: Install LinkedIn ZIP Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install csv-parse and yauzl-promise**

```bash
npm install csv-parse yauzl-promise
npm install -D @types/yauzl-promise
```

`csv-parse`: Robust CSV parser with sync mode, quote handling, BOM detection.
`yauzl-promise`: Promise-based ZIP extraction. MVP loads ZIP into memory via `fromBuffer` (bounded by 100 MB route limit). Post-MVP: stream from disk via `fromFd` if larger archives are needed.

**Step 2: Commit**

```
chore: add csv-parse + yauzl-promise for LinkedIn ZIP import
```

---

## Task 9: LinkedIn ZIP Date Normalizer

**Files:**
- Create: `src/lib/connectors/linkedin-zip/date-normalizer.ts`
- Test: `tests/evals/linkedin-date-normalizer.test.ts`

**Context:** LinkedIn dates come in many formats. Must output strict ISO or null. Design section 5.3.

**Step 1: Write exhaustive tests**

```typescript
describe("normalizeLinkedInDate", () => {
  // Standard LinkedIn formats
  it("parses 'Apr 2024' → '2024-04'", ...);
  it("parses 'Jan 2020' → '2020-01'", ...);
  it("parses 'Dec 2019' → '2019-12'", ...);

  // Full date formats
  it("parses '2016-10-26 10:15 UTC' → '2016-10-26'", ...);
  it("parses '11 Feb 2026' → '2026-02-11'", ...);
  it("parses '2/9/26, 2:53 PM' → '2026-02-09'", ...);

  // Year-only
  it("parses '2022' → '2022'", ...);

  // Edge cases
  it("returns null for empty string", ...);
  it("returns null for garbage input", ...);
  it("returns null for 'YYYY'", ...); // placeholder rejection
  it("returns null for null/undefined", ...);
});
```

**Step 2: Implement normalizer**

```typescript
const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export function normalizeLinkedInDate(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();

  // Reject placeholders
  if (/^[YMD-]+$/.test(s)) return null;

  // ISO full date: 2016-10-26... → 2016-10-26
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // "Mon YYYY": Apr 2024 → 2024-04
  const monYearMatch = s.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (monYearMatch) {
    const mm = MONTH_MAP[monYearMatch[1].toLowerCase()];
    if (mm) return `${monYearMatch[2]}-${mm}`;
  }

  // "DD Mon YYYY": 11 Feb 2026 → 2026-02-11
  const ddMonYYYY = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (ddMonYYYY) {
    const mm = MONTH_MAP[ddMonYYYY[2].toLowerCase()];
    if (mm) return `${ddMonYYYY[3]}-${mm}-${ddMonYYYY[1].padStart(2, "0")}`;
  }

  // US short: M/D/YY → 20YY-MM-DD
  const usShort = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}),?\s*/);
  if (usShort) {
    const yy = parseInt(usShort[3]);
    const year = yy < 50 ? 2000 + yy : 1900 + yy;
    return `${year}-${usShort[1].padStart(2, "0")}-${usShort[2].padStart(2, "0")}`;
  }

  // Year only: 2022
  const yearOnly = s.match(/^(\d{4})$/);
  if (yearOnly) return yearOnly[1];

  return null; // Unparseable
}
```

**Step 3: Run tests, commit**

```
feat(connectors): add LinkedIn date normalizer with strict ISO output
```

---

## Task 10: LinkedIn ZIP CSV Parser

**Files:**
- Create: `src/lib/connectors/linkedin-zip/parser.ts`
- Test: `tests/evals/linkedin-zip-parser.test.ts`
- Create: `tests/fixtures/linkedin/` (test CSV fixtures)

**Context:** Must handle: preamble rows, BOM, multiline quoted fields, empty files. Design section 5.3.

**Step 1: Write tests**

Test cases:
- Parses clean CSV with headers → array of objects
- Handles BOM (UTF-8 `\uFEFF`) → strips it
- Handles preamble rows (like `Connections.csv` "Notes:" prefix) → finds real header
- Handles multiline quoted fields → preserves newlines in value
- Empty file → returns empty array
- Missing expected columns → returns partial objects + logs warning

Create fixture files in `tests/fixtures/linkedin/`:
- `Skills.csv` — clean, simple
- `Positions.csv` — with dates, multiline descriptions
- `Connections.csv` — with preamble

**Step 2: Implement parser**

```typescript
import { parse } from "csv-parse/sync";

export type CsvRow = Record<string, string>;

export function parseLinkedInCsv(content: string): CsvRow[] {
  // Strip BOM
  const cleaned = content.replace(/^\uFEFF/, "");

  // Detect preamble: if first line doesn't look like a CSV header, skip until we find one
  const lines = cleaned.split("\n");
  let headerLineIdx = 0;

  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    // A header line typically has multiple comma-separated values
    if (lines[i].includes(",") && !lines[i].startsWith("Notes:") && !lines[i].startsWith("#")) {
      headerLineIdx = i;
      break;
    }
  }

  const csvContent = lines.slice(headerLineIdx).join("\n");

  try {
    return parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
  } catch {
    return [];
  }
}
```

**Step 3: Run tests, commit**

```
feat(connectors): add LinkedIn CSV parser with BOM + preamble handling
```

---

## Task 11: LinkedIn ZIP Fact Mappers

**Files:**
- Create: `src/lib/connectors/linkedin-zip/mapper.ts`
- Test: `tests/evals/linkedin-zip-mapper.test.ts`

**Context:** Maps each CSV file type to `FactInput[]`. Design section 5.4. Key naming: `li-` prefix. Experience ordering: chronological, single "current".

**Step 1: Write tests**

Test cases per CSV file type:
- `mapProfile(rows)` — name, headline, location, websites, twitter
- `mapProfileSummary(rows)` — summary text
- `mapPositions(rows)` — experience facts, chronological order, single "current"
- `mapPositions([])` — empty → no facts
- `mapEducation(rows)` — education facts
- `mapSkills(rows)` — skill facts with `li-` prefix
- `mapLanguages(rows)` — language facts with proficiency mapping
- `mapCertifications(rows)` — achievement facts
- `mapCourses(rows)` — achievement facts
- `mapCompanyFollows(rows)` — interest facts
- `mapCauses(rows)` — interest facts
- Position key uniqueness (same company, different years)
- Position key collision (same company, same year, different roles → index suffix)

**Step 2: Implement mapper**

Each function takes `CsvRow[]` and returns `FactInput[]`. Use `normalizeLinkedInDate()` for all dates. Use slug generation for keys (`li-<company-slug>-<start-year>`).

Key implementation details:
- `mapPositions` sorts by start date ascending, marks only the latest without end date as `status: "current"`, all others `status: "past"`
- `mapLanguages` maps LinkedIn proficiency values (`NATIVE_OR_BILINGUAL`, `FULL_PROFESSIONAL`, `LIMITED_WORKING`, etc.) to internal levels
- URL normalization: prepend `https://` if missing scheme
- Slug function: lowercase, replace non-alphanumeric with `-`, trim dashes

```typescript
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

const PROFICIENCY_MAP: Record<string, string> = {
  NATIVE_OR_BILINGUAL: "native",
  FULL_PROFESSIONAL: "fluent",
  PROFESSIONAL_WORKING: "advanced",
  LIMITED_WORKING: "intermediate",
  ELEMENTARY: "beginner",
};
```

**Step 3: Run tests, commit**

```
feat(connectors): add LinkedIn ZIP fact mappers (10 CSV types)
```

---

## Task 12: LinkedIn ZIP Import Orchestration

**Files:**
- Create: `src/lib/connectors/linkedin-zip/import.ts`
- Test: `tests/evals/linkedin-zip-import.test.ts`

**Context:** Receives a ZIP buffer, extracts CSVs, maps all to facts, batch writes. Design section 5.6.

**Step 1: Write tests**

Test cases:
- `importLinkedInZip(buffer, scope, username, factLanguage)` — extracts, maps, writes facts
- Returns `ImportReport` with correct counts
- Skips excluded files (messages.csv, Ad_Targeting.csv, etc.)
- Handles corrupt ZIP → returns error report
- Handles ZIP with missing CSVs → processes what exists, skips missing

**Step 2: Implement import**

```typescript
import yauzl from "yauzl-promise";
import { Readable } from "node:stream";
import { parseLinkedInCsv } from "./parser";
import { mapProfile, mapProfileSummary, mapPositions, mapEducation, mapSkills,
         mapLanguages, mapCertifications, mapCourses, mapCompanyFollows, mapCauses } from "./mapper";
import { batchCreateFacts } from "../connector-fact-writer";
import type { OwnerScope } from "@/lib/auth/session";
import type { ImportReport } from "../types";

const FILE_MAPPERS: Record<string, (rows: CsvRow[]) => FactInput[]> = {
  "Profile.csv": mapProfile,
  "Profile Summary.csv": mapProfileSummary,
  "Positions.csv": mapPositions,
  "Education.csv": mapEducation,
  "Skills.csv": mapSkills,
  "Languages.csv": mapLanguages,
  "Certifications.csv": mapCertifications,
  "Courses.csv": mapCourses,
  "Company Follows.csv": mapCompanyFollows,
  "Causes You Care About.csv": mapCauses,
};

// FIX #4: All lowercase so comparison with filename.toLowerCase() works correctly
const EXCLUDE_FILES = new Set([
  "messages.csv", "guide_messages.csv", "learning_role_play_messages.csv",
  "ad_targeting.csv", "receipts_v2.csv", "registration.csv",
]);

export async function importLinkedInZip(
  buffer: Buffer,
  scope: OwnerScope,
  username: string,
  factLanguage: string,
): Promise<ImportReport> {
  const allFacts: FactInput[] = [];

  // FIX #6: Catch corrupt ZIP errors gracefully
  let zipReader;
  try {
    zipReader = await yauzl.fromBuffer(buffer);
  } catch (error) {
    return {
      factsWritten: 0,
      factsSkipped: 0,
      errors: [{ reason: `Invalid ZIP: ${error instanceof Error ? error.message : String(error)}` }],
    };
  }

  // FIX #5: Wrap in try/finally to ensure ZIP reader is closed
  try {
    for await (const entry of zipReader) {
      const filename = entry.filename.split("/").pop() ?? entry.filename;

      if (EXCLUDE_FILES.has(filename.toLowerCase())) continue;

      const mapper = FILE_MAPPERS[filename];
      if (!mapper) continue;

      const stream = await entry.openReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      const content = Buffer.concat(chunks).toString("utf-8");

      const rows = parseLinkedInCsv(content);
      const facts = mapper(rows);
      allFacts.push(...facts);
    }
  } finally {
    await zipReader.close();
  }

  return batchCreateFacts(allFacts, scope, username, factLanguage);
}
```

**Step 3: Run tests, commit**

```
feat(connectors): add LinkedIn ZIP import orchestration
```

---

## Task 13: LinkedIn ZIP Upload API Route

**Files:**
- Create: `src/app/api/connectors/linkedin-zip/import/route.ts`
- Test: `tests/evals/linkedin-zip-api.test.ts`

**Context:** Multipart upload endpoint. Max 100 MB. Auth-gated. Design section 5.2.

**Step 1: Write test**

Test cases:
- POST with valid ZIP → 200 + ImportReport
- POST without auth → 403
- POST with file > 100 MB → 413
- POST without file → 400
- POST with non-ZIP file → 400

**Step 2: Implement route**

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { getAuthContext } from "@/lib/auth/session";
import { importLinkedInZip } from "@/lib/connectors/linkedin-zip/import";
import { getFactLanguage } from "@/lib/services/preferences-service";

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

export async function POST(req: NextRequest) {
  const scope = resolveOwnerScope(req);
  if (!scope) {
    // FIX #10: Match existing connector route error contract
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  const authCtx = getAuthContext(req);
  const username = authCtx?.username ?? "__default__";

  const contentLength = parseInt(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_SIZE) {
    return NextResponse.json(
      { success: false, code: "FILE_TOO_LARGE", error: "File too large (max 100 MB)." },
      { status: 413 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, code: "NO_FILE", error: "No file uploaded." },
        { status: 400 },
      );
    }

    if (!file.name.endsWith(".zip") && file.type !== "application/zip") {
      return NextResponse.json(
        { success: false, code: "INVALID_FORMAT", error: "File must be a ZIP archive." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (buffer.length > MAX_SIZE) {
      return NextResponse.json(
        { success: false, code: "FILE_TOO_LARGE", error: "File too large (max 100 MB)." },
        { status: 413 },
      );
    }

    const factLanguage = getFactLanguage(scope.knowledgePrimaryKey) ?? "en";
    const report = await importLinkedInZip(buffer, scope, username, factLanguage);

    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("[linkedin-zip-import] Error:", error);
    return NextResponse.json(
      { success: false, code: "IMPORT_FAILED", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
```

**Step 3: Run tests, commit**

```
feat(connectors): add LinkedIn ZIP upload API (multipart, 100MB limit)
```

---

## Task 14: Hardening — Private-Contact Category + Edge Cases

**Files:**
- Modify: `src/lib/services/fact-validation.ts` (add `private-contact` rule)
- Modify: `src/lib/connectors/linkedin-zip/mapper.ts` (use `private-contact` for email/phone)
- Test: `tests/evals/connector-hardening.test.ts`

**Context:** Design sections 5.5 and 7.5. Email/phone from LinkedIn must use `private-contact` category (which IS in SENSITIVE_CATEGORIES → forces `private` visibility).

**Step 1: Add `private-contact` to CATEGORY_RULES + widen email validation condition**

In `fact-validation.ts`:

1. Add category rule:
```typescript
"private-contact": { requiredOneOf: ["value", "email", "phone"], emailFields: ["email"] },
```

2. FIX #7 + review Finding 2: Widen the email validation condition AND decouple from `value.type === "email"` for `private-contact`:
```typescript
// Before (line ~174):
if (rules.emailFields && category === "contact") {
  const contactType = value.type;
  if (contactType === "email") {

// After:
if (rules.emailFields && (category === "contact" || category === "private-contact")) {
  // For "contact": existing behavior — only validate when type === "email"
  // For "private-contact": always validate emailFields that are present (no type gate)
  const shouldValidateEmail = category === "private-contact" || value.type === "email";
  if (shouldValidateEmail) {
```

3. In the LinkedIn mapper, `private-contact` facts use `{ email: "...", type: "email" }` (with explicit type) for consistency:
```typescript
// mapper.ts — mapEmailAddresses
facts.push({
  category: "private-contact",
  key: `li-email-${i}`,
  value: { email: row["Email Address"], type: "email" },
});
```

**Step 2: Add opt-in LinkedIn files mapper**

In `mapper.ts`, add opt-in mappers (not in default `FILE_MAPPERS`, in separate `OPT_IN_MAPPERS` map with flag to enable):
- `Email Addresses.csv` → `private-contact/li-email-<index>` with `{ email: "...", type: "email" }`
- `PhoneNumbers.csv` → `private-contact/li-phone-<index>` with `{ phone: "...", type: "phone" }`

All `private-contact` facts MUST include `type` field for consistent validation behavior.

**Step 3: Write tests for edge cases**

- Invalid ZIP (not actually a zip) → graceful error
- ZIP with no recognized CSVs → empty report (0 written, 0 skipped)
- CSV with all invalid dates → facts written without date fields, logged
- Very large position count (100+) → all written, single "current"

**Step 4: Run all connector tests, commit**

```
feat(connectors): add private-contact category + import hardening
```

---

## Task 15: Integration Test — Full GitHub Flow

**Files:**
- Create: `tests/evals/github-connector-e2e.test.ts`

**Context:** End-to-end test: register → sync (mocked API) → verify facts created → disconnect → verify facts preserved.

Test flow:
1. Register connectors: call `registerConnector(githubDefinition)` + `createConnector()`
2. Mock GitHub API responses (profile + 3 repos + languages)
3. FIX #8: Call `handleConnectorSync({ ownerKey })` (not `syncGitHub` directly) to exercise full worker path including sync_log writes
4. Verify: facts created with correct categories/keys
5. Verify: `connector_items` entries exist
6. Verify: `sync_log` entry with status="success" (written by handleConnectorSync)
7. Disconnect via `disconnectConnector(connectorId)`
8. Verify: facts still exist, credentials cleared

**Commit:**

```
test(connectors): add GitHub connector integration test
```

---

## Task 16: Integration Test — Full LinkedIn ZIP Flow

**Files:**
- Create: `tests/evals/linkedin-zip-e2e.test.ts`
- Create: `tests/fixtures/linkedin/test-export.zip` (generated in test setup)

**Context:** End-to-end test: upload ZIP → verify facts → verify draft recomposed.

Test flow:
1. Create a test ZIP in memory with known CSVs (Profile, Positions, Skills, Education)
2. Call `importLinkedInZip(buffer, scope, username, "en")`
3. Verify: correct number of facts created
4. Verify: experience ordering (single "current")
5. Verify: skill facts have `li-` prefix
6. Verify: draft was recomposed (exists after import)
7. Verify: ImportReport matches expected counts

**Commit:**

```
test(connectors): add LinkedIn ZIP import integration test
```

---

## Task 17: Run Full Test Suite + Final Cleanup

**Step 1: Run all tests**

```bash
npx vitest run
```

Expected: ALL PASS (existing 850+ tests + new connector tests)

**Step 2: Fix any failures**

Address type errors, import issues, test isolation problems.

**Step 3: Final commit**

```
chore(connectors): test suite green after full connector implementation
```

---

## Summary

| Task | Milestone | Description | New Files | Est. |
|------|-----------|-------------|-----------|------|
| 1 | A fix | Sync handler dispatch hook | 0 | 15m |
| 2 | A fix | Connector registration + wiring | 3 | 20m |
| 3 | B | GitHub API client | 1 | 30m |
| 4 | B | GitHub fact mapper | 1 | 30m |
| 5 | B | GitHub initial sync | 1 | 30m |
| 6 | B | GitHub connector OAuth | 2 | 30m |
| 7 | B | GitHub manual sync route | 1 | 15m |
| 8 | C | Install CSV/ZIP deps | 0 | 5m |
| 9 | C | LinkedIn date normalizer | 1 | 20m |
| 10 | C | LinkedIn CSV parser | 1 | 20m |
| 11 | C | LinkedIn fact mappers | 1 | 45m |
| 12 | C | LinkedIn import orchestration | 1 | 30m |
| 13 | C | LinkedIn upload API route | 1 | 20m |
| 14 | D | Private-contact + hardening | 0 | 20m |
| 15 | D | GitHub E2E integration test | 1 | 30m |
| 16 | D | LinkedIn E2E integration test | 1 | 30m |
| 17 | D | Full test suite + cleanup | 0 | 15m |
