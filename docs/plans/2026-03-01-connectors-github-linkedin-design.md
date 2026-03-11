# GitHub + LinkedIn Connectors (ZIP-first) — Design Note

**Date:** 2026-03-01
**Status:** Proposed
**Revised:** 2026-03-02 (code-review pass — resolved 6 critical/high, 6 medium, 2 low findings)
**Revised:** 2026-03-02 (online + codebase verification pass — 7 additional findings resolved)
**Scope:** Phase 1d connector MVP (GitHub + LinkedIn ZIP import), plus post-launch evaluation for LinkedIn browser extension

---

## 1) Goal

Build two connectors:

1. **GitHub connector** for continuous sync of repos/activity into facts.
2. **LinkedIn connector** focused on **manual ZIP ingestion** (fast bootstrap of KB/page from exported data).

And evaluate (not launch immediately) a third option:

3. **LinkedIn browser extension** that reads the user's own profile DOM with explicit consent.

---

## 2) Current Codebase Reality (as of 2026-03-01)

What already exists:

- `connectors` and `sync_log` tables exist in schema (`src/lib/db/schema.ts`).
- Worker supports `connector_sync` as a job type (placeholder in `src/lib/worker/index.ts`).
- OAuth login for GitHub and LinkedIn already exists under `/api/auth/*`.
- Owner scoping (`OwnerScope`) and async worker/scheduler are already solid.
- `SOURCE_PRECEDENCE` in `conflict-service.ts` already includes `connector: 2`.

What is missing:

- No connector service layer (no registry, no connector implementations).
- No connector API routes (connect/disconnect/status/manual sync/import).
- `connector_sync` handler is still placeholder (empty body).
- No fact-ingestion path that logs `actor="connector"` and supports connector idempotency.

Important technical gaps before implementation:

- `facts.source` precedence logic in conflict-service expects `source="connector"`, but a connector may be tempted to write `connector:github`.
  We should keep canonical `source="connector"` and track provider details separately (connector metadata / event payload / link table).
- **`createFact` guardrails**: Several internal guardrails in `kb-service.ts` affect connector writes and must be accounted for (see Section 7.5).
- **`createFact` actor**: The `logEvent` call inside `createFact` hardcodes `actor: "assistant"`. Connector writes need `actor: "connector"`. See Section 7.5.

---

## 3) LinkedIn ZIP: Observed Real Format (from local sample)

Inspected archive:

- `~/Scaricati/Basic_LinkedInDataExport_03-01-2026.zip.zip`
- 29 CSV files.
- Key files for KB bootstrap are present:
  - `Profile.csv`
  - `Profile Summary.csv`
  - `Positions.csv`
  - `Education.csv`
  - `Skills.csv`
  - `Languages.csv`
  - `Certifications.csv`
  - `Courses.csv`
  - `Company Follows.csv`
  - `Causes You Care About.csv`

Important parsing characteristics found:

- CSV with quoted multiline text (`Rich_Media.csv`, `messages.csv`).
- Some files have preamble rows before real header (`Connections.csv` starts with `Notes:` text).
- Date formats vary (`Apr 2024`, `2016-10-26 10:15 UTC`, `2/9/26, 2:53 PM`, `11 Feb 2026`).
- Duplicate header names exist in some files (`Ad_Targeting.csv`).
- Potentially sensitive files are included (`messages.csv`, email/phones, receipts, ad targeting).

Implication: parser must be resilient and policy-driven (include/exclude sets), not hardcoded to a "clean CSV" assumption.

---

## 4) GitHub Connector Design (MVP)

### 4.1 Product behavior

- User connects GitHub from OpenSelf settings.
- Initial sync imports profile+repos into facts.
- Incremental sync runs in worker (`connector_sync`) on schedule + manual "Sync now".
- Imported changes are proposed, not auto-published.

### 4.2 Auth strategy

- Use a **dedicated connector OAuth flow**, separate from login OAuth.
- Keep login scopes minimal; request connector scopes only when user explicitly connects GitHub.
- Store connector token in `connectors.credentials` (**encrypted at rest from day one** — see Section 7.6).

Exact OAuth scopes for MVP:

- **`read:user`** — read profile data (name, bio, company, location, blog, twitter). Required for `/user` endpoint private fields.
- **No `repo` or `public_repo` scope** — the authenticated `/user/repos?type=public` endpoint already returns public repos without repo scopes. This keeps the permission footprint minimal.
- Post-MVP opt-in: add `repo` scope for users who want to import private repositories.

### 4.3 Token lifecycle

GitHub OAuth app tokens **expire after 1 year of inactivity** (no API calls). They can also be revoked by the user, the app owner, or GitHub (if exposed publicly). Additionally, GitHub enforces a limit of 10 tokens per user/app/scope combination — older tokens are auto-revoked when exceeded.

For robustness:

- On every API call, handle `401 Unauthorized` → mark connector `status: "error"`, prompt user to reconnect.
- Store token creation timestamp in credentials JSON. Track `last_used_at` to detect approaching inactivity expiry.
- If we later migrate to **GitHub Apps** (which use short-lived 8-hour tokens + 6-month refresh tokens), the `connectors.credentials` JSON can accommodate `{ access_token, refresh_token, expires_at }` without schema changes.
- Incremental sync should gracefully degrade: if token is invalid, skip sync and log, don't crash worker.

### 4.4 Data fetched in MVP

Initial sync:

- User profile basics (`/user`) for social/profile facts.
- Repositories (`/user/repos`) for projects.
- Repo languages (`/repos/{owner}/{repo}/languages`) for skill signals.

Incremental sync:

- User events (`/users/{username}/events`) as freshness signal. **Limitation**: events API returns only the last 30 days, max 300 events. Sufficient for detecting recent repo activity but not for historical analysis.
- Re-fetch only changed repositories (compare `pushed_at` timestamp).
- Use `ETag` / `If-None-Match` on all requests — **confirmed: 304 responses do NOT count against the 5000 req/hr rate limit** (GitHub docs).

### 4.5 Fact mapping

GitHub API fields (from `/user` response) → OpenSelf facts:

- `login`, `html_url` → `social/github` → `{ platform: "github", url: html_url, username: login }`
- `bio` → `identity/gh-bio` → `{ text: bio }` (only if non-empty; does NOT overwrite chat-created `identity/summary`)
- `company` → `identity/gh-company` → `{ value: company }` (only if non-empty)
- `location` → `identity/gh-location` → `{ city: location }` (only if non-empty)
- `blog` → `social/gh-website` → `{ url: blog }` (only if non-empty; URL normalization required)
- `twitter_username` → `social/gh-twitter` → `{ platform: "twitter", username: twitter_username }` (only if non-empty)

GitHub API fields (from `/user/repos` response) → OpenSelf facts:

- Per repo: `project/gh-<node_id>` → `{ name, description, url: html_url, tags:[language keys], status: archived ? "archived" : "active" }`
- Aggregated: `skill/<language>` → `{ name: language, evidence: "N repositories" }`
- Aggregated: `stat/github-repos` → `{ label: "GitHub repositories", value: "<count>" }`

Key naming strategy: prefix keys with `gh-` + GitHub's stable `node_id` (for repos) or `gh-` prefix (for profile fields) to avoid collision with manually created facts. Never use repo names as keys (they can be renamed).

### 4.6 Sync semantics

- Idempotent upserts keyed by stable external IDs (repo `node_id`).
- Keep `source="connector"` for precedence compatibility.
- Log provenance (`connectorType`, external id, sync run id) in `connector_items` linkage table.
- Use conditional requests (`ETag`, `If-None-Match`) to reduce API usage. **Confirmed**: 304 responses do NOT count against the 5000 req/hr primary rate limit (GitHub docs).

---

## 5) LinkedIn ZIP Connector Design (MVP)

### 5.1 Product behavior

- User uploads LinkedIn ZIP manually from builder settings.
- System parses archive server-side and writes structured facts.
- Draft page is recomposed immediately (single batch recomposition).
- User reviews proposed public facts and publishes when ready.

### 5.2 Ingestion API

- `POST /api/connectors/linkedin-zip/import` (multipart upload).
- **Upload limits**: max 100 MB, validated MIME type (`application/zip`), streaming extraction via `yauzl` or `unzipper` (never load full archive into memory).
- Worker job `connector_sync` with payload `{ connectorType:"linkedin_zip", mode:"import", importId }`.
- Import progress exposed via lightweight status endpoint (`GET /api/connectors/linkedin-zip/status/:importId`).

### 5.3 Parser and normalization

Parser requirements:

- Robust CSV parser (e.g. `csv-parse`) with quote/multiline support.
- Header detection with fallback (skip preamble rows like `Connections.csv` notes).
- BOM/encoding normalization (detect UTF-8 BOM, strip it).
- URL normalization: for any `url` field, ensure `http://` or `https://` scheme before writing facts (required by `validateFactValue()` URL checks).
- **Strict date normalization** to ISO format — not best-effort. All dates must pass through `normalizeLinkedInDate()` which outputs either:
  - Full ISO `YYYY-MM-DD` (when day is known)
  - Partial `YYYY-MM` (when only month/year)
  - Partial `YYYY` (when only year)
  - `null` (unparseable → skip date field, log warning)

  This is required because `validateFactValue()` in `createFact` rejects placeholder patterns like `YYYY-YYYY`. The normalizer must handle all observed LinkedIn formats: `Apr 2024`, `2016-10-26 10:15 UTC`, `2/9/26, 2:53 PM`, `11 Feb 2026`.

MVP include-set (import by default):

- `Profile.csv`
- `Profile Summary.csv`
- `Positions.csv`
- `Education.csv`
- `Skills.csv`
- `Languages.csv`
- `Certifications.csv`
- `Courses.csv`
- `Company Follows.csv`
- `Causes You Care About.csv`

MVP opt-in (disabled by default):

- `Connections.csv` (only derive aggregated stats by default)
- `Email Addresses.csv`, `PhoneNumbers.csv`, `Whatsapp Phone Numbers.csv` (private contact only)
- `Learning.csv` (can become reading/activity facts)

MVP exclude-set (do not ingest):

- `messages.csv`, `guide_messages.csv`, `learning_role_play_messages.csv`
- `Ad_Targeting.csv`
- `Receipts_v2.csv`
- `Registration.csv`
- job-alert/search preference files unless user explicitly asks

### 5.4 LinkedIn ZIP → OpenSelf fact mapping

Key naming strategy: prefix keys with `li-` to avoid collision with chat-created facts.

> **Note on CSV column headers**: The exact column names below are from inspection of a real LinkedIn export (March 2026). LinkedIn may change these without notice — the parser should fail gracefully on missing columns and log warnings.

- **`Profile.csv`** — columns: `First Name`, `Last Name`, `Maiden Name`, `Address`, `Birth Date`, `Headline`, `Summary`, `Industry`, `Zip Code`, `Geo Location`, `Twitter Handles`, `Websites`, `Instant Messengers`
  - `First Name` + `Last Name` → `identity/full-name` → `{ full: "First Last" }`
  - `Headline` → `identity/role` or `identity/tagline` → `{ role: headline }` or `{ tagline: headline }`
  - `Geo Location` → `identity/location` → `{ city: geo }`
  - `Industry` → `identity/industry` → `{ value: industry }`
  - `Websites` → `social/li-website-<index>` → `{ url: website }` (URL normalization required)
  - `Twitter Handles` → `social/li-twitter` → `{ platform: "twitter", username: handle }`
- **`Profile Summary.csv`** — columns: `Summary`  (may be empty or absent)
  - → `identity/summary` → `{ text: summary }`
- **`Positions.csv`** — columns: `Company Name`, `Title`, `Description`, `Location`, `Started On`, `Finished On`
  - → `experience/li-<company-slug>-<start-year>` (see Section 7.5 for collision handling)
  - Value: `{ role: Title, company: "Company Name", description: Description, start: normalizeDate("Started On"), end: normalizeDate("Finished On"), status }`
  - **Ordering rule**: import chronologically (oldest first). Mark all positions as `status: "past"` except the most recent without a `Finished On` date → `status: "current"`. ~~This respects `CURRENT_UNIQUE_CATEGORIES` guardrail.~~ (Note 2026-03-11: constraint removed — multiple current roles now valid. Mapper still uses single-current logic, could be relaxed in follow-up.)
  - Date fields: `Started On` / `Finished On` are typically `Mon YYYY` format (e.g. `Apr 2024`). Parse to `YYYY-MM`.
- **`Education.csv`** — columns: `School Name`, `Start Date`, `End Date`, `Notes`, `Degree Name`, `Activities`
  - → `education/li-<school-slug>-<start-year>` → `{ institution: "School Name", degree: "Degree Name", start, end, description: Notes }`
- **`Skills.csv`** — columns: `Name`
  - → `skill/li-<skill-slug>` → `{ name: Name }`
- **`Languages.csv`** — columns: `Name`, `Proficiency`
  - → `language/li-<lang-slug>` → `{ language: Name, proficiency: mapProficiency(Proficiency) }`
  - LinkedIn proficiency values (e.g. `NATIVE_OR_BILINGUAL`, `FULL_PROFESSIONAL`, `LIMITED_WORKING`) mapped to internal levels via `PROF_KEYS`.
- **`Certifications.csv`** — columns: `Name`, `Url`, `Authority`, `Started On`, `Finished On`, `License Number`
  - → `achievement/li-cert-<name-slug>` → `{ title: Name, issuer: Authority, url, start, end }`
- **`Courses.csv`** — columns: `Name`, `Number`
  - → `achievement/li-course-<name-slug>` → `{ title: Name }`
- **`Company Follows.csv`** — columns: `Organization`
  - → `interest/li-follow-<slug>` → `{ name: Organization }`
- **`Causes You Care About.csv`** — columns: `Name`
  - → `interest/li-cause-<slug>` → `{ name: Name }`

### 5.5 Visibility + trust policy

Visibility is determined by `initialVisibility()` in `src/lib/visibility/policy.ts`, with connector-specific overrides:

- **Non-sensitive categories** (identity, experience, skill, education, etc.): `initialVisibility` with `mode: "onboarding"` + `confidence: 1.0` → `proposed`. This is the correct default for imported facts.
- **Email / phone / WhatsApp** (opt-in files): written as category `private-contact` (NOT `contact`), which IS in `SENSITIVE_CATEGORIES` → forces `private`. This matches the intent that personal contact info should never auto-propose.
- **Websites** from Profile.csv: written as category `social` → `proposed` (appropriate: public URLs).
- Preserve full import audit in `sync_log` + `agent_events`.
- Show user import summary: created/updated/skipped + reasons.

> **Why `private-contact` not `contact`**: The `contact` category is in `PROPOSAL_ALLOWLIST` and NOT in `SENSITIVE_CATEGORIES`, so it would become `proposed` — wrong for emails/phones from LinkedIn. Use `private-contact` which IS sensitive.

> **Validation caveat**: `CATEGORY_RULES` in `fact-validation.ts` has rules for `contact` (requiring `value`/`email`/`phone`/`address` + email format validation) but NOT for `private-contact`. Facts written as `private-contact` pass with any non-empty object. This is acceptable since: (a) data comes from LinkedIn's own export, (b) the connector-fact-writer should pre-validate email format before writing. Add a `private-contact` entry to `CATEGORY_RULES` if stricter validation is desired post-MVP.

### 5.6 Quick page bootstrap (batch recomposition)

After ingestion of ALL facts (not per-fact):

1. **Single batch recomposition**: call `projectCanonicalConfig()` + `upsertDraft()` once after the entire import completes. This is efficient because `recomposeAfterMutation()` lives in the agent `tools.ts` closure and is NOT triggered by raw `createFact` calls — so we're already safe from per-fact recompose storms.
   **Performance note**: `createFact` is async (due to `normalizeCategory`), so a 50-fact import requires 50 sequential awaits. This is intentional to avoid SQLite write contention. For a typical LinkedIn export (~30-60 facts), this should complete in under 2 seconds. If post-MVP profiling shows bottlenecks, consider a batch-insert variant that bypasses per-fact validation overhead.
2. Trigger async personalization for impacted sections by reusing the existing `generate_page` pattern (`detectImpactedSections` + `prioritizeSections` + `personalizeSection`). There is no `personalizeSections()` helper today.
3. Show "Import complete" banner with CTA to review publishable diff.

---

## 6) Post-Launch Option: LinkedIn Browser Extension

### 6.1 Technical concept

- Browser extension runs on LinkedIn profile page.
- Reads DOM from **user's own profile page** only.
- Sends normalized JSON payload to OpenSelf import endpoint.

### 6.2 Why this is high risk

- LinkedIn's legal/user-policy language strongly restricts scraping and automation, including browser extensions used for profile extraction.
- Even with user consent and "own profile only", platform policy risk remains material.

### 6.3 Recommendation

- **Do not launch extension in initial release.**
- Launch ZIP import first (compliant and explicit user export flow).
- Reassess extension only after product-market validation, with legal review and strict safeguards.

---

## 7) Required Schema / Service Additions

### 7.1 DB changes

`connectors` table should be extended with ownership + operational fields:

- `profile_id` (owner anchor)
- `status` (`connected`, `paused`, `error`)
- `sync_cursor` JSON
- `last_error`
- `updated_at`

New table for idempotency/provenance:

- `connector_items` (`connector_id`, `external_id`, `external_hash`, `fact_id`, `last_seen_at`)

### 7.2 New services

- `connector-registry.ts` (typed interface + registry)
- `github-connector.ts`
- `linkedin-zip-connector.ts`
- `connector-service.ts` (connect/disconnect/sync orchestration)
- `connector-fact-writer.ts` (source canonicalization + visibility defaults + audit)

### 7.3 Worker integration

- Replace placeholder `connector_sync` handler with owner-level fan-out:
  - one `connector_sync` job per `ownerKey`
  - handler loads all active connectors for that owner and dispatches by `connectorType`
  - this intentionally matches current dedup index `uniq_jobs_dedup(job_type, json_extract(payload, '$.ownerKey'))`
  - avoids silent job drops when a user has both GitHub and LinkedIn connectors
- Retry/backoff already inherited from existing worker framework.

### 7.4 sessionId strategy for connector writes

`createFact` requires a `sessionId` (unique constraint is `sessionId + category + key`). The connector must write into the correct session context.

**Decision: use the owner's anchor session.**

- `OwnerScope.knowledgePrimaryKey` is the anchor session where all KB facts live.
- In worker context: use `resolveOwnerScopeForWorker(ownerKey)` from `src/lib/auth/session.ts`.
- In HTTP routes: use `resolveOwnerScope(req)` from `src/lib/auth/session.ts`.
- The connector-fact-writer receives the `profileId` from the `connectors` row, resolves the anchor session, and uses `knowledgePrimaryKey` as the `sessionId` for all `createFact` calls.
- This ensures connector facts are co-located with chat-created facts and visible to OwnerScope queries.
- The `connector_items` linkage table tracks which facts came from which connector (provenance), so disconnect/cleanup can find them even though they share the same sessionId.

For the LinkedIn ZIP import (no prior session possible — new user bootstrap):

- If the user has no existing session (fresh signup + immediate import), the import endpoint must first ensure an anchor session exists via `resolveOwnerScope()` or equivalent bootstrap. The session is created as part of the auth flow, so this should already be in place.

### 7.5 `createFact` guardrails — connector compatibility

Several guardrails in `kb-service.ts:createFact` affect bulk imports:

| Guardrail | Impact on connector | Mitigation |
|-----------|-------------------|------------|
| `validateFactValue()` | Rejects malformed values and placeholder dates | Parser must produce strictly valid values. `normalizeLinkedInDate()` must output ISO or partial ISO. Values that fail validation are **skipped** (not crash), logged to import report. |
| ~~`CURRENT_UNIQUE_CATEGORIES`~~ | ~~Only one `status: "current"` per category allowed~~ **(DEPRECATED 2026-03-11: set emptied, multiple current roles valid)** | LinkedIn mapper still marks only the most recent as `current` — could be relaxed in follow-up. |
| Experience key collision (company mismatch) | `createFact` throws if `experience/<key>` exists with different company | Use `li-<company-slug>-<start-year>` keys to guarantee uniqueness. If slug collision occurs (same company, same year, different role), append `-<index>`. |
| `logEvent` hardcoded `actor: "assistant"` | Audit trail shows wrong actor | **Refactor `createFact`** to accept optional `actor` parameter (default `"assistant"` for backward compat). Connector-fact-writer passes `actor: "connector"`. Small, safe change. |
| `initialVisibility` with `mode: "onboarding"` | Contact facts would be `proposed` not `private` | Use `private-contact` category for sensitive contact data (see 5.5). For non-sensitive data, `mode: "onboarding"` → `proposed` is actually correct. |

### 7.6 Credential encryption at rest

**Must be implemented in Milestone A** (foundation), not deferred to hardening.

Strategy:

- Application-level AES-256-GCM encryption for `connectors.credentials` JSON.
- Encryption key: `CONNECTOR_ENCRYPTION_KEY` env var (32 bytes, hex-encoded).
- Helper functions: `encryptCredentials(json) → encrypted_base64`, `decryptCredentials(encrypted_base64) → json`.
- The `credentials` column stores the encrypted blob; decryption happens only at read time in `connector-service.ts`.
- Key rotation: not in MVP scope, but the encrypted payload includes a `keyVersion` field for future rotation.

### 7.7 Connector disconnect / cleanup

When a user disconnects a connector:

1. Soft-disconnect: mark `connectors.status = "disconnected"`, clear credentials.
2. Imported facts are **NOT deleted** — they remain as the user's data.
3. `connector_items` rows are preserved (provenance audit trail).
4. No further syncs are scheduled.
5. If user reconnects later, `connector_items.external_id` enables re-linking without duplicating facts.

Rationale: deleting imported facts on disconnect would be destructive and unexpected. The user explicitly reviewed and possibly published those facts. They belong to the user now.

---

## 8) Test Strategy

### 8.1 Unit tests

- **Date normalizer**: exhaustive test matrix for all observed LinkedIn date formats → expected ISO output. Include edge cases (empty, null, garbage strings).
- **CSV parser**: test with preamble rows, BOM, multiline quotes, duplicate headers. Use fixture files extracted from the real LinkedIn archive (anonymized).
- **Fact mapper** (LinkedIn → OpenSelf): test each CSV file type → expected fact category/key/value. Verify key uniqueness strategy (slugging, dedup index).
- **Fact mapper** (GitHub → OpenSelf): test profile, repos, languages → expected facts.
- **Connector-fact-writer**: test `source="connector"`, actor override, visibility policy per category, batch create + single recompose.
- **Experience ordering**: test position ordering with multiple positions. (Note 2026-03-11: `CURRENT_UNIQUE_CATEGORIES` emptied — multiple current roles now valid.)
- **Credential encryption**: round-trip test (encrypt → decrypt → compare).

### 8.2 Integration tests

- **GitHub sync flow**: mock GitHub API responses, verify facts created with correct keys/values, verify `connector_items` linkage, verify incremental sync (changed repos only).
- **LinkedIn ZIP import flow**: upload real fixture ZIP → verify facts, visibility, import report, draft recomposition.
- **Disconnect flow**: verify credentials cleared, facts preserved, no further syncs.
- **Error handling**: invalid ZIP (not a zip, too large, missing expected CSVs), expired GitHub token, network errors.

### 8.3 E2E tests (Milestone D)

- Full GitHub connect → sync → verify page → disconnect cycle.
- Full LinkedIn ZIP upload → review → publish cycle.
- Representative ZIP fixtures (anonymized from real exports).

---

## 9) Rollout Plan

### Milestone A — Connector foundation (2-3 days)

- DB migration (connector ownership/idempotency tables, `connector_items`)
- **Credential encryption** helpers + `CONNECTOR_ENCRYPTION_KEY` env setup
- `createFact` refactor: add optional `actor` parameter (backward-compatible)
- Connector registry + service skeleton
- `connector-fact-writer.ts` with batch write + single recompose pattern
- Basic API routes (`status`, `sync-now`, `disconnect`)
- Unit tests for encryption, fact-writer, disconnect logic

### Milestone B — GitHub connector MVP (2-3 days)

- Dedicated connector OAuth flow (separate from login)
- Token storage (encrypted) + 401 handling
- Initial sync (profile + repos + languages → facts)
- Incremental sync (event-based freshness + conditional requests)
- Fact mapping + `connector_items` linkage
- Unit + integration tests (mocked GitHub API)

### Milestone C — LinkedIn ZIP MVP (3-4 days)

- Upload API with size limit (100 MB) + MIME validation + streaming extraction
- CSV parser with preamble/BOM/multiline handling
- `normalizeLinkedInDate()` with strict ISO output
- Fact mappers for all 10 include-set CSV files
- Experience ordering (chronological, single `current`)
- Visibility policy (`private-contact` for sensitive data)
- Import report (created/updated/skipped with reasons)
- Batch recompose + async personalization
- Unit tests (parser, date normalizer, mappers, ordering)
- Integration test with fixture ZIP

### Milestone D — Hardening + E2E (2-3 days)

- Redaction of sensitive data in logs
- E2E tests with representative ZIP fixtures
- E2E test for full GitHub connect → sync → disconnect cycle
- Edge case hardening (corrupt ZIPs, partial imports, network failures)
- Status endpoint polish (progress reporting for large imports)

Total estimated: **9-13 days**

Extension evaluation is **separate post-launch track**.

---

## 10) External References

GitHub:

- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps (scope reference: `read:user`, `public_repo`, `repo`)
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation (token lifecycle: 1-year inactivity expiry, 10-token limit per user/app/scope)
- https://docs.github.com/en/rest/users/users?apiVersion=2022-11-28 (GET /user — profile fields: name, bio, company, location, blog, twitter_username)
- https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#list-repositories-for-the-authenticated-user (GET /user/repos — includes node_id, pushed_at, language)
- https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#list-repository-languages
- https://docs.github.com/en/rest/activity/events?apiVersion=2022-11-28#list-events-for-the-authenticated-user (30-day window, max 300 events)
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28 (5000 req/hr per OAuth app; 304 conditionals don't count)
- https://docs.github.com/en/rest/guides/best-practices-for-using-the-rest-api?apiVersion=2022-11-28 (ETag polling, webhook recommendation)

LinkedIn (ZIP export context):

- https://www.linkedin.com/help/linkedin/answer/a566336 (exporting connections and archive behavior)
- https://www.linkedin.com/help/linkedin/answer/a586456 (third-party app data use / portability context)
- https://www.linkedin.com/help/linkedin/answer/a1341382 (prohibited software/extensions — relevant for extension evaluation only)

---

## Appendix: Review Findings Resolution Log

All findings from the 2026-03-02 code review are tracked here for traceability.

| ID | Severity | Finding | Resolution |
|----|----------|---------|------------|
| C1 | Critical | `createFact` requires sessionId but plan didn't specify which session connector uses | Added Section 7.4: use anchor session via `OwnerScope.knowledgePrimaryKey` |
| C2 | Critical | `logEvent` in `createFact` hardcodes `actor: "assistant"` | Added to Section 7.5: refactor `createFact` to accept optional `actor` param; scheduled in Milestone A |
| C3 | Critical | Batch recomposition not specified (risk of per-fact recompose storm) | Added to Section 5.6: single `projectCanonicalConfig()` + `upsertDraft()` after all facts; explained why `recomposeAfterMutation` doesn't fire |
| H1 | High | Contact visibility mismatch (`contact` is in PROPOSAL_ALLOWLIST, not SENSITIVE_CATEGORIES) | Added to Section 5.5: use `private-contact` category for email/phone; documented in 7.5 table |
| H2 | High | `validateFactValue` rejects placeholder dates; LinkedIn dates need strict normalization | Added to Section 5.3: `normalizeLinkedInDate()` with strict ISO output; skip+log on failure |
| H3 | High | Credential encryption deferred to Milestone D (too late) | Moved to Section 7.6 + Milestone A |
| H4 | High | No upload size limit or streaming for ZIP import | Added to Section 5.2: 100 MB limit, MIME validation, streaming extraction |
| H5 | High | Experience key collision with `createFact` company-mismatch guardrail | Added to Sections 5.4 + 7.5: `li-<company-slug>-<start-year>` keys with index suffix for collisions |
| H6 | ~~High~~ Resolved | ~~`CURRENT_UNIQUE_CATEGORIES` rejects multiple `status: "current"` per category~~ **(DEPRECATED 2026-03-11: constraint removed)** | Was: chronological import order. Now: multiple current roles valid. |
| M1 | Medium | GitHub token refresh/expiry not mentioned | Added Section 4.3: token lifecycle, 401 handling, future GitHub Apps migration path |
| M2 | Medium | Timeline 6-10 days optimistic | Revised to 9-13 days in Section 9 |
| M3 | Medium | No test strategy | Added Section 8: unit, integration, and E2E test plan |
| M4 | Medium | Disconnect cleanup not described | Added Section 7.7: soft-disconnect, facts preserved, credentials cleared |
| L1 | Low | Absolute path in document | Fixed: replaced with `~/Scaricati/...` |
| L2 | Low | LinkedIn API references irrelevant for ZIP flow | Pruned: removed API/rate-limit links, kept only export/portability/extension-policy links |

### Online + codebase verification pass (2026-03-02)

| ID | Severity | Finding | Resolution |
|----|----------|---------|------------|
| F1 | Medium | Plan said GitHub OAuth tokens "do not expire by default" — **wrong**. They expire after 1 year of inactivity. 10-token limit per user/app/scope. | Corrected in Section 4.3 with accurate expiry rules + `last_used_at` tracking |
| F2 | Medium | Exact GitHub OAuth scopes not specified (just "public-profile/repo read") | Added exact scopes in Section 4.2: `read:user` only for MVP, no `repo` scope needed |
| F3 | Confirmed | ETag 304 responses don't count against GitHub rate limits | Documented in Sections 4.5 and 4.6 |
| F4 | Low | GitHub events API 30-day / 300-event limit not noted | Added limitation note in Section 4.4 incremental sync |
| F5 | Low | No `CATEGORY_RULES` for `private-contact` in `fact-validation.ts` — email validation (Rule 4) only triggers for `category === "contact"` | Documented caveat in Section 5.5; pre-validate in connector-fact-writer; post-MVP add `private-contact` to CATEGORY_RULES |
| F6 | Medium | LinkedIn CSV source column headers not documented — only target fields | Added full CSV column documentation from real archive inspection in Section 5.4 |
| F7 | Info | Bulk import: 50 sequential `createFact` awaits. Intentional for SQLite safety. | Added performance note in Section 5.6 with profiling guidance |
