# Phase 1d Closing — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close Phase 1d with three features: Connector UI in builder, Avatar upload, and Public page auto-translation.

**Architecture:** Each feature builds on existing infrastructure. Connector API routes exist; avatar DB/service/retrieval exist; translation pipeline + cache exist. This work wires UI and fills integration gaps.

---

## Feature 1: Connector UI in SettingsPanel

### Location

New "Integrations" section at the bottom of `SettingsPanel`, below Layout. Visible only when `!languageOnly` (i.e., when a draft exists).

### Components

**ConnectorSection** (inside SettingsPanel):
- Fetches `/api/connectors/status` when panel opens
- Renders a card per connector type (GitHub, LinkedIn ZIP)

**GitHub card states:**
- **Not connected**: "Connect GitHub" button → redirect to `/api/connectors/github/connect`
- **Connected**: Green badge, last sync time, "Sync Now" + "Disconnect" buttons
- **Error**: Red badge with `lastError`, "Reconnect" + "Disconnect" buttons. `retryable` flag from API determines if reconnect is shown
- **Syncing**: Spinner + disabled buttons (lock prevents double-click)

**LinkedIn ZIP card:**
- "Import LinkedIn" button → native file picker → upload via FormData to `/api/connectors/linkedin-zip/import`
- Progress indicator during upload
- After success: "X facts imported" toast, preview updates via SSE

### OAuth Return Flow

When GitHub OAuth callback redirects to `/builder?connector=github_connected`:
1. Builder detects `?connector=` query param on mount
2. Opens SettingsPanel automatically, scrolled to Integrations
3. Consumes the param once, then cleans URL via `window.history.replaceState()` to prevent re-trigger on refresh

### Server-Side Protections

All connector routes already require auth (resolveOwnerScope). Additional hardening:

- **Idempotency lock**: `sync` and `import` routes check for in-flight operations before proceeding. Sync: check if a `connector_sync` job is already queued/running for this ownerKey. Import: use a transient server-side flag (e.g., connector status set to "importing" during operation).
- **Rate limiting**: Sync button disabled for 60s after trigger (client-side). Server rejects if last sync was < 60s ago.
- **Disconnect**: Ownership verification already exists (`connector.ownerKey !== ownerKey` → 403).

### Error Contract

All connector API responses use a standardized error shape:

```typescript
type ConnectorApiError = {
  success: false;
  code: string;          // e.g., "AUTH_REQUIRED", "ALREADY_SYNCING", "IMPORT_FAILED"
  error: string;         // Human-readable message
  retryable: boolean;    // UI shows "Retry" vs "Reconnect" vs nothing
};
```

### Data Flow

SettingsPanel manages connector state internally (no new props from SplitView):

```
SettingsPanel opens
  → fetch GET /api/connectors/status
  → render cards based on connector list

User clicks "Connect GitHub"
  → window.location = /api/connectors/github/connect
  → GitHub OAuth flow
  → callback creates connector + enqueues sync
  → redirect to /builder?connector=github_connected

User clicks "Sync Now"
  → POST /api/connectors/github/sync
  → server checks no in-flight sync, enqueues job
  → UI shows spinner, polls status until complete

User clicks "Import LinkedIn"
  → file picker → POST /api/connectors/linkedin-zip/import
  → server validates + imports
  → response: { success: true, factsWritten: N, factsSkipped: M }

User clicks "Disconnect"
  → POST /api/connectors/{id}/disconnect
  → server clears credentials, sets status "disconnected"
  → card reverts to "not connected" state
```

---

## Feature 2: Avatar Upload

### What Already Exists

| Component | Status |
|---|---|
| `media_assets` table (migration 0001) | Complete |
| `uploadAvatar(profileId, data, mimeType)` in media-service | Complete |
| `getMediaById(id)` in media-service | Complete |
| `GET /api/media/[id]` serving endpoint | Complete (1-year cache) |
| `HeroContent.avatarUrl` field | Defined |
| Hero components render avatarUrl (fallback to initials) | Complete |

### What to Build

1. **`POST /api/media/avatar`** — Upload endpoint
   - Auth-gated (resolveOwnerScope)
   - Accepts FormData with `file` field
   - Server-side validation:
     - Max 2MB (already in media-service, belt-and-suspenders at route level too)
     - MIME type check: image/jpeg, image/png, image/webp, image/gif
     - Magic bytes validation (file signature check, not just Content-Type header)
     - EXIF stripping server-side (strip metadata before storing)
   - Calls `uploadAvatar(profileId, strippedBuffer, mimeType)`
   - Returns `{ id, url: "/api/media/{id}" }`
   - New upload generates new mediaId (unique SHA-256 of content) → automatic cache-busting since URL changes

2. **`DELETE /api/media/avatar`** — Remove endpoint
   - Auth-gated
   - Deletes avatar row from `media_assets` for the profile
   - Returns `{ success: true }`
   - Page recomposes (hero falls back to initials)

3. **Composer wiring** in `buildHeroSection()`:
   - New function `getProfileAvatar(profileId)` in media-service — returns media ID or null
   - `buildHeroSection()` calls it, populates `content.avatarUrl = "/api/media/{id}"` if avatar exists
   - On delete, avatarUrl is absent → hero renders initials

4. **UI in SettingsPanel**:
   - New "Avatar" section above Integrations
   - Shows current avatar (circular, 64px) or initials placeholder
   - "Upload" button → file picker → POST → preview updates
   - "Remove" button (shown only when avatar exists) → DELETE → preview updates

### Cache Busting Strategy

Each `uploadAvatar()` call generates a new `id` based on `crypto.randomUUID()`. Since the URL is `/api/media/{id}`, a new upload = new URL = browsers fetch fresh. The old media ID's 1-year cache is harmless (orphaned, never requested again).

### Constraints

- MVP: avatar only (no gallery, no cover photos)
- Storage: SQLite blob (local-first, single-file portability)
- One avatar per profile (enforced by unique index)
- EXIF removal: use `sharp` or manual JFIF/EXIF strip (evaluate smallest dependency)

---

## Feature 3: Public Page Auto-Translation

### Flow

1. Visitor opens `/{username}`
2. Server reads `Accept-Language` header, parses with q-weights, matches against 8 supported languages, falls back to page's `sourceLanguage`
3. If visitor language != page `sourceLanguage` → calls `translatePageContent()` (cache-first)
4. Serves translated config to `PageRenderer`
5. **TranslationBanner** at top: "Automatically translated from {sourceLang}. [View original]"
6. Click "View original" → reloads with `?lang=original` → serves untranslated page

### Language Precedence (highest to lowest)

1. `?lang=` query parameter (explicit override; `?lang=original` skips translation)
2. Future: language preference cookie (not MVP, but precedence defined)
3. `Accept-Language` header (parsed with q-weights, region fallback: `fr-CA` → `fr`)
4. Page's `sourceLanguage` (no translation needed)

### Accept-Language Parsing

```
Accept-Language: fr-CA,fr;q=0.9,en;q=0.8,de;q=0.5
→ Parse q-weights, sort descending
→ For each: try exact match (fr-CA), then base language (fr)
→ First match against SUPPORTED_LANGUAGES wins
→ No match → page sourceLanguage (no translation)
```

### Source Language Storage

`sourceLanguage` saved as a **snapshot at publish time** in the `page` row. Not derived at runtime.

- `confirmPublish()` / publish pipeline reads `factLanguage` from owner's agentConfig and stores it as `page.sourceLanguage`
- Requires a migration to add `source_language TEXT` column to `page` table
- This ensures banner text and cache keys stay coherent even if the owner later changes their factLanguage

### Cache Key Design

The existing `translation_cache` uses `(content_hash, target_language)` as the composite key. The `content_hash` is SHA-256 of the translatable sections JSON, which implicitly includes the source language content. This is sufficient because:

- Same content hash = same source text = same source language
- Different source languages produce different content hashes
- Model version changes are rare; when they happen, we can clear the cache

No changes to the cache schema needed.

### TranslationBanner Component

- Server component rendered above PageRenderer on translated pages
- Text: "Automatically translated from {languageName}. [View original]"
- "View original" links to `?lang=original`
- **Bot detection**: Skip translation for known crawlers (check User-Agent for Googlebot, Bingbot, etc.) — serve original content for SEO
- Styling: subtle bar, dismissible, matches page theme

### Cost Model

- ~$0.001 per translation (Haiku tier)
- 100 pages × 7 languages = ~$0.70 one-time
- Subsequent visitors hit cache → $0
- Budget guardrails already enforced by `translatePageContent()` (uses llm_usage_daily accounting)

### Graceful Degradation

- Translation failure → serve original page, no banner (already implemented in `translatePageContent()`)
- Invalid Accept-Language → no translation
- Missing sourceLanguage on old published pages → no translation (safe default)

---

## File Map (All Features)

### Feature 1: Connector UI
- Modify: `src/components/settings/SettingsPanel.tsx` — add Integrations section
- Create: `src/components/settings/ConnectorSection.tsx` — connector cards
- Modify: `src/app/builder/page.tsx` — detect `?connector=` param, clean URL
- Modify: `src/app/api/connectors/github/sync/route.ts` — add idempotency check
- Modify: `src/app/api/connectors/linkedin-zip/import/route.ts` — add idempotency check

### Feature 2: Avatar Upload
- Create: `src/app/api/media/avatar/route.ts` — POST upload + DELETE remove
- Modify: `src/lib/services/media-service.ts` — add `getProfileAvatar()`, EXIF stripping
- Modify: `src/lib/services/page-composer.ts` — wire avatar into `buildHeroSection()`
- Modify: `src/components/settings/SettingsPanel.tsx` — add Avatar section

### Feature 3: Public Page Translation
- Modify: `src/app/[username]/page.tsx` — Accept-Language parsing, translation call
- Create: `src/lib/i18n/accept-language.ts` — parser with q-weights + region fallback
- Create: `src/components/page/TranslationBanner.tsx` — banner component
- Create: `db/migrations/NNNN_page_source_language.sql` — add source_language column
- Modify: `src/lib/services/page-service.ts` — store sourceLanguage at publish time
- Modify: `src/lib/db/schema.ts` — add sourceLanguage to page table

### Tests
- `tests/evals/connector-ui.test.ts` — connector status fetch, disconnect, idempotency
- `tests/evals/avatar-upload.test.ts` — upload, delete, MIME validation, magic bytes, size limit
- `tests/evals/avatar-composer.test.ts` — buildHeroSection avatarUrl wiring
- `tests/evals/accept-language.test.ts` — parser with q-weights, region fallback, bot detection
- `tests/evals/public-page-translation.test.ts` — full flow, cache hit/miss, banner logic, ?lang=original

---

## Non-Goals (Explicitly Out of Scope)

- Gallery or cover photo uploads (avatar only for MVP)
- Agent-initiated avatar upload (user-only via UI)
- Language preference cookie for visitors (future)
- Pre-translating pages on publish (future optimization)
- Translation of dynamic/JS content (static server-rendered only)
