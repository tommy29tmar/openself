# Connector Data Enrichment (Strava + Spotify) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform connector-imported data from "sad" generic items (Walk/Run/Ride, bare song titles) into rich, localized, visually impressive content that makes the user say "wow".

**Architecture:** Fix data bugs (field name mismatch in DB), enrich API data extraction (elevation, pace, album), localize sport names at composition time (8 languages), and redesign monolith variant components to show rich detail inline instead of hidden in tooltips.

**Tech Stack:** SQLite migration (json_set/json_remove), TypeScript, Next.js, React components.

**Plan file:** `docs/superpowers/plans/2026-03-13-connector-data-enrichment.md`

---

## Context

The user's published page at openself.dev/tommaso-rinversi shows impoverished connector data:
- **Strava**: 3 pills ("Walk", "Run", "Ride") — English names, no km/hours/elevation, all detail hidden in tooltip
- **Spotify**: 20 items mixed (artists + tracks) with just names — no album info, artist field exists in DB but not visible in monolith

Root causes: (1) DB field name mismatch — production facts have `totalDistance`/`totalTime` but composer expects `distanceKm`/`timeHrs`, (2) MonolithLayout overrides variant to "monolith" which renders pills with detail in tooltip only (`Activities.tsx:23-65`), (3) no sport name localization, (4) Spotify client doesn't capture album info, (5) published page is a stale snapshot needing re-publish.

---

## Chunk 1: Migration & Strava Mapper Enrichment

### Task 1: Migration 0035 — Fix Strava fact field names

**Files:**
- Create: `db/migrations/0035_connector_enrichment.sql`
- Modify: `src/lib/db/migrate.ts:9`

- [ ] **Step 1: Write migration SQL**

```sql
-- Fix v1-format Strava facts: totalDistance → distanceKm, totalTime → timeHrs
-- Double guard: only touch facts that have old field AND lack new field
-- Same json_set(json_remove(...)) pattern proven in migration 0033
UPDATE facts
SET value = json_set(
  json_remove(json_remove(value, '$.totalDistance'), '$.totalTime'),
  '$.distanceKm', json_extract(value, '$.totalDistance'),
  '$.timeHrs', json_extract(value, '$.totalTime')
)
WHERE category = 'activity'
  AND key LIKE 'strava-%'
  AND json_extract(value, '$.totalDistance') IS NOT NULL
  AND json_extract(value, '$.distanceKm') IS NULL;
```

- [ ] **Step 2: Bump EXPECTED_SCHEMA_VERSION to 35 in `src/lib/db/migrate.ts:9`**

- [ ] **Step 3: Commit**

### Task 2: Strava mapper — Add elevation aggregation

**Files:**
- Modify: `src/lib/connectors/strava/mapper.ts` (`mapStravaActivities`, lines 39-72)

Note: `total_elevation_gain` already exists in `StravaActivity` type at `client.ts:29`. No client change needed.

- [ ] **Step 1: Write failing test in `tests/evals/strava-mapper.test.ts`**

Test cases:
- `elevationM` present when `total_elevation_gain > 0` across activities
- `elevationM` absent when all activities have `total_elevation_gain === 0`
- Correct aggregation (sum of all activities' elevation, rounded)

- [ ] **Step 2: Add elevation aggregation to mapStravaActivities**

Insert after `totalTimeHrs` calculation (line 55), before value object construction:
```typescript
const totalElevationM = Math.round(
  acts.reduce((sum, a) => sum + a.total_elevation_gain, 0),
);
```
Then after `if (totalTimeHrs > 0) value.timeHrs = totalTimeHrs;` (line 64):
```typescript
if (totalElevationM > 0) value.elevationM = totalElevationM;
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

### Task 3: Spotify client & mapper — Add album info

**Files:**
- Modify: `src/lib/connectors/spotify/client.ts:29-34` (SpotifyTrack type)
- Modify: `src/lib/connectors/spotify/mapper.ts:53-63` (mapSpotifyTopTracks)

**Implementation note:** The current `mapSpotifyTopTracks` uses an inline object literal for `value`. Must restructure to a mutable `value` variable (like the Strava mapper) before adding the conditional album field.

- [ ] **Step 1: Write failing test in `tests/evals/spotify-mapper.test.ts`**

Test cases:
- `album` present when track has `album.name`
- `album` absent when track has no album field
- `album` absent when `album.name` is empty string
- Existing `toEqual` tests still pass (fixtures lack album → optional field omitted)

- [ ] **Step 2: Add album to SpotifyTrack type**

```typescript
export type SpotifyTrack = {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album?: { name: string };
  external_urls: { spotify: string };
};
```

- [ ] **Step 3: Restructure mapper to mutable value + add album**

```typescript
export function mapSpotifyTopTracks(tracks: SpotifyTrack[]): FactInput[] {
  return tracks.map((t) => {
    const value: Record<string, unknown> = {
      title: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      url: t.external_urls.spotify,
    };
    if (t.album?.name) value.album = t.album.name;
    return {
      category: "music",
      key: `sp-track-${t.id}`,
      value,
    };
  });
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

---

## Chunk 2: L10N & Content Types

### Task 4: L10N — Sport names + enrichment labels

**Files:**
- Modify: `src/lib/i18n/ui-strings.ts` (interface is `UiStrings` at line 6, NOT `L10nStrings`)

- [ ] **Step 1: Add 12 new keys to `UiStrings` interface and ALL 8 language objects**

New keys: `sportRun`, `sportWalk`, `sportRide`, `sportSwim`, `sportHike`, `sportYoga`, `sportTrailRun`, `sportWeightTraining`, `sportWorkout`, `sportOther`, `elevationLabel`, `paceLabel`

**All 8 language translations (BUILD-BLOCKER — TypeScript fails if any language missing):**

| Key | en | it | de | fr | es | pt | ja | zh |
|-----|----|----|----|----|----|----|----|----|
| sportRun | Running | Corsa | Laufen | Course | Carrera | Corrida | ランニング | 跑步 |
| sportWalk | Walking | Camminata | Gehen | Marche | Caminata | Caminhada | ウォーキング | 步行 |
| sportRide | Cycling | Ciclismo | Radfahren | Cyclisme | Ciclismo | Ciclismo | サイクリング | 骑行 |
| sportSwim | Swimming | Nuoto | Schwimmen | Natation | Natación | Natação | 水泳 | 游泳 |
| sportHike | Hiking | Escursione | Wandern | Randonnée | Senderismo | Caminhada | ハイキング | 徒步 |
| sportYoga | Yoga | Yoga | Yoga | Yoga | Yoga | Yoga | ヨガ | 瑜伽 |
| sportTrailRun | Trail Running | Trail Running | Trailrunning | Trail | Trail Running | Trail Running | トレイルラン | 越野跑 |
| sportWeightTraining | Weight Training | Pesi | Krafttraining | Musculation | Pesas | Musculação | ウェイトトレーニング | 力量训练 |
| sportWorkout | Workout | Allenamento | Training | Entraînement | Entrenamiento | Treino | ワークアウト | 锻炼 |
| sportOther | Other | Altro | Sonstiges | Autre | Otro | Outro | その他 | 其他 |
| elevationLabel | D+ | D+ | D+ | D+ | D+ | D+ | D+ | D+ |
| paceLabel | pace | ritmo | Tempo | allure | ritmo | ritmo | ペース | 配速 |

- [ ] **Step 2: Verify TypeScript compilation** (`npx tsc --noEmit`)

- [ ] **Step 3: Commit**

### Task 5: Content types — Add album to MusicItem

**Files:**
- Modify: `src/lib/page-config/content-types.ts:104-110`
- Modify: `src/themes/editorial-360/components/Music.tsx:5-10` (local MusicItem type)

- [ ] **Step 1: Add `album?: string` to MusicItem in content-types.ts (after `note`)**
- [ ] **Step 2: Add `album?: string` to local MusicItem type in Music.tsx (after `note`)**
- [ ] **Step 3: Commit**

---

## Chunk 3: Page Composer Enrichment

### Task 6: Activities builder — Sport name L10N + elevation + pace

**Files:**
- Modify: `src/lib/services/page-composer.ts` (`buildActivitiesSection`, lines 1233-1292)

**Critical restructuring notes (from code review):**
1. Rename `name` (line 1239) to `rawName` throughout the `.map()` callback
2. Move `actCount` declaration UP from line 1264 to BEFORE the activityType block (line 1242)
3. Consolidate multiple `getUiL10n(language)` calls to a single `const t = getUiL10n(language)` at top of callback
4. Gate activityType assignment with `if (!actCount)` to suppress redundant "Sport" badge for Strava facts

- [ ] **Step 1: Write failing test `tests/evals/activity-sport-l10n.test.ts`**

Test cases:
- Known sport names localized (Run → "Corsa" in Italian)
- Unknown sport names pass through unchanged
- Elevation shown in description when `elevationM > 0`
- Pace shown for Run/TrailRun only, NOT for Walk/Ride
- Pace edge case: seconds=60 rounds up minute
- **Treadmill test**: Run with no distanceKm → pace is absent (no division by zero)
- **Low-km guard**: Run with `distanceKm < 5` → pace is absent (prevents absurd values)
- activityType badge suppressed when activityCount present
- Description parts joined with " · "

- [ ] **Step 2: Restructure the `.map()` callback**

The full restructured callback:
```typescript
.map((f) => {
  const v = val(f);
  const rawName = str(v.name) ?? str(v.value);
  if (!rawName) return null;

  const t = getUiL10n(language);

  // Localize sport name
  const SPORT_NAME_L10N: Record<string, string> = {
    Run: t.sportRun, Walk: t.sportWalk, Ride: t.sportRide,
    Swim: t.sportSwim, Hike: t.sportHike, Yoga: t.sportYoga,
    TrailRun: t.sportTrailRun, "Trail Run": t.sportTrailRun,
    WeightTraining: t.sportWeightTraining, "Weight Training": t.sportWeightTraining,
    Workout: t.sportWorkout,
  };
  const item: ActivityItem = { name: SPORT_NAME_L10N[rawName] ?? rawName };

  // actCount extraction (BEFORE activityType — needed for suppression)
  const actCount = typeof v.activityCount === "number" ? v.activityCount : undefined;

  // activityType badge — suppress for Strava-structured facts (redundant with localized sport name)
  if (!actCount) {
    const activityType = str(v.activityType) ?? str(v.type);
    if (activityType) {
      const ACTIVITY_TYPE_L10N: Record<string, string> = {
        volunteering: t.activityVolunteering, mentoring: t.activityMentoring,
        hobby: t.activityHobby, sport: t.activitySport,
      };
      item.activityType = (ACTIVITY_TYPE_L10N[activityType] ?? activityType) as ActivityItem["activityType"];
    }
  }

  // Frequency (unchanged)
  const frequency = str(v.frequency);
  if (frequency) {
    const FREQ_L10N: Record<string, string> = {
      daily: t.freqDaily, weekly: t.freqWeekly, monthly: t.freqMonthly,
      biweekly: t.freqBiweekly, frequent: t.freqFrequent,
      regularly: t.freqRegularly, occasionally: t.freqOccasionally,
    };
    item.frequency = FREQ_L10N[frequency.toLowerCase()] ?? frequency;
  }

  // Structured Strava description (enriched)
  if (actCount !== undefined) {
    const parts: string[] = [];
    parts.push(`${actCount} ${actCount === 1 ? t.activityCountSingular : t.activityCountPlural}`);
    const km = typeof v.distanceKm === "number" ? v.distanceKm : undefined;
    if (km && km > 0) parts.push(`${km} km`);
    const hrs = typeof v.timeHrs === "number" ? v.timeHrs : undefined;
    if (hrs && hrs > 0) parts.push(`${hrs} ${hrs === 1 ? t.hourSingular : t.hourPlural}`);

    // Elevation
    const elevM = typeof v.elevationM === "number" ? v.elevationM : undefined;
    if (elevM && elevM > 0) parts.push(`${elevM}m ${t.elevationLabel}`);

    // Pace — running only, minimum 5km to avoid absurd values
    const isRunning = rawName === "Run" || rawName === "TrailRun" || rawName === "Trail Run";
    if (isRunning && km && km >= 5 && hrs && hrs > 0) {
      const paceMinPerKm = (hrs * 60) / km;
      let paceMin = Math.floor(paceMinPerKm);
      let paceSec = Math.round((paceMinPerKm - paceMin) * 60);
      if (paceSec === 60) { paceSec = 0; paceMin++; }
      parts.push(`${paceMin}:${String(paceSec).padStart(2, "0")}/km ${t.paceLabel}`);
    }

    item.description = parts.join(" · ");
  } else {
    const description = str(v.description);
    if (description) item.description = description;
  }

  return item;
})
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

### Task 7: Music builder — Album extraction

**Files:**
- Modify: `src/lib/services/page-composer.ts` (`buildMusicSection`, lines 1045-1075)

- [ ] **Step 1: Add album extraction after note (line 1058), before url**

```typescript
const album = str(v.album);
if (album) item.album = album;
```

Note: requires `album` on MusicItem (Task 5). Task ordering is correct (Chunk 2 before Chunk 3).

- [ ] **Step 2: Run existing music tests, verify pass**

- [ ] **Step 3: Commit**

---

## Chunk 4: Component Rendering Improvements

### Task 8: Activities.tsx — Redesign monolith variant

**Files:**
- Modify: `src/themes/editorial-360/components/Activities.tsx` (monolith section, lines 23-65)

Pre-check: No component snapshot/rendering tests found for Activities.tsx (verified via grep in tests/).

- [ ] **Step 1: Replace pill `<span>` with compact card `<div>`**

New monolith card design:
```tsx
const cardStyle: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 12,
  border: "1px solid var(--page-border)",
  background: "var(--page-muted)", minWidth: 140, flex: "1 1 auto",
};
const nameStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: "var(--page-fg)",
};
const descStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--page-fg-secondary)", marginTop: 4, opacity: 0.8,
};
const typeStyle: React.CSSProperties = {
  fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.08em",
  color: "var(--page-fg-secondary)", opacity: 0.6, marginTop: 4,
};
```

- [ ] **Step 2: Unify expanded/collapsed rendering into single block**

Replace separate `visible.map()` + `expanded && hidden.map()` with:
```tsx
{(expanded ? items : visible).map((item, i) => (
  <div key={i} style={cardStyle}>
    <div style={nameStyle}>{item.name}</div>
    {item.description && <div style={descStyle}>{item.description}</div>}
    {item.activityType && <div style={typeStyle}>{item.activityType}</div>}
  </div>
))}
```

- [ ] **Step 3: Verify rendering locally**

- [ ] **Step 4: Commit**

### Task 9: Music.tsx — Add album display

**Files:**
- Modify: `src/themes/editorial-360/components/Music.tsx`

Note: The monolith variant already renders `item.artist` (lines 34-36). Artist IS displayed when present in the data. The main enrichment here is adding album info. The published page's missing artist is due to the stale published snapshot, which resolves after re-publish.

- [ ] **Step 1: In monolith variant (lines 34-36), replace artist-only block with combined artist+album**

```tsx
{(item.artist || item.album) && (
  <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 2 }}>
    {[item.artist, item.album].filter(Boolean).join(" — ")}
  </div>
)}
```

- [ ] **Step 2: In default (list) variant (after line 103), add album below artist**

```tsx
{item.album && (
  <div className="text-base text-[var(--page-fg-secondary)] mt-1 italic">
    {item.album}
  </div>
)}
```

- [ ] **Step 3: In compact variant, add album if present (same pattern)**

- [ ] **Step 4: Verify rendering locally**

- [ ] **Step 5: Commit**

---

## Chunk 5: Tests & Verification

### Task 10: Update existing tests

**Files:**
- Modify: `tests/evals/strava-mapper.test.ts`
- Modify: `tests/evals/spotify-mapper.test.ts`

- [ ] **Step 1: Add elevation test cases to strava-mapper.test.ts**
- [ ] **Step 2: Add album test cases to spotify-mapper.test.ts**
- [ ] **Step 3: Verify all existing tests still pass**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

### Task 11: Run full test suite

- [ ] **Step 1: Run `npx vitest run` — expect all ~3019 tests pass**
- [ ] **Step 2: Run `npx tsc --noEmit` — expect zero errors**

### Task 12: Deploy

- [ ] **Step 1: Commit all changes**
- [ ] **Step 2: Push to main**
- [ ] **Step 3: Deploy via Coolify API**
- [ ] **Step 4: Trigger Strava re-sync (if needed) to refresh facts with new mapper output**
- [ ] **Step 5: Verify on openself.dev/tommaso-rinversi after re-publish**

---

## Verification

1. **Migration**: After deploy, check DB: `SELECT key, json_extract(value, '$.distanceKm'), json_extract(value, '$.timeHrs'), json_extract(value, '$.elevationM') FROM facts WHERE category='activity'` — should show numbers
2. **Activities section**: Cards with localized names ("Camminata", "Corsa", "Ciclismo") + "92 km · 19 ore · Xm D+" + pace for running (only when >= 5km)
3. **Music section**: Tracks with artist name below, album name where available
4. **All tests pass**: `npx vitest run` + `npx tsc --noEmit`

## Notes

- **Expand/collapse button L10N** (Activities.tsx monolith): Pre-existing issue — hardcoded English "collapse"/"N more" strings. Out of scope for this plan.
- **Draft recompose timing**: Migration fixes DB data but does NOT trigger draft recompose. The draft rebuilds on the next connector sync (daily scheduler) via `recomposeDraft()` in `batchCreateFacts`. **If the Strava connector is disconnected/errored**, the user must reconnect and sync, or send a chat message that triggers a page action to force recompose.
- **Published page staleness**: After deploy + next sync, the draft auto-recomposes. User must re-publish to update the public page.
- **Music artist visibility**: The `Music.tsx` monolith variant already renders `item.artist` (lines 34-36). The missing artist on the published page is due to a stale published snapshot (pre-migration 0033). Resolves after recompose + re-publish.

## File Change Summary

| File | Change | Lines |
|------|--------|-------|
| `db/migrations/0035_connector_enrichment.sql` | NEW | ~10 |
| `src/lib/db/migrate.ts` | MOD | 1 |
| `src/lib/connectors/strava/mapper.ts` | MOD | ~5 |
| `src/lib/connectors/spotify/client.ts` | MOD | ~3 |
| `src/lib/connectors/spotify/mapper.ts` | MOD | ~15 (restructure to mutable value) |
| `src/lib/page-config/content-types.ts` | MOD | 1 |
| `src/lib/i18n/ui-strings.ts` | MOD | ~120 (12 keys × 8 langs + interface) |
| `src/lib/services/page-composer.ts` | MOD | ~40 (activities restructure + music album) |
| `src/themes/editorial-360/components/Activities.tsx` | MOD | ~40 (monolith pills → cards) |
| `src/themes/editorial-360/components/Music.tsx` | MOD | ~15 (album display) |
| `tests/evals/strava-mapper.test.ts` | MOD | ~20 |
| `tests/evals/spotify-mapper.test.ts` | MOD | ~20 |
| `tests/evals/activity-sport-l10n.test.ts` | NEW | ~100 |

## Review Findings Addressed

| Finding | Source | Resolution |
|---------|--------|-----------|
| D1: `L10nStrings` → `UiStrings` | code-explorer | Fixed in Task 4 |
| D2: Spotify mapper uses object literal | code-explorer | Task 3 Step 3 now shows full restructure |
| D3: `actCount` must move before activityType | code-explorer | Task 6 Step 2 shows full restructured callback |
| D4: `name` → `rawName` rename needed | code-explorer | Explicit in Task 6 restructuring notes |
| D5: Consolidate `getUiL10n` calls | code-explorer | Single `const t` at top of callback |
| RISK-1: Treadmill pace test gap | code-reviewer | Added treadmill test case in Task 6 Step 1 |
| RISK-2: Disconnected connector | code-reviewer | Added explicit note in Notes section |
| RISK-3: Absurd pace on low km | code-reviewer | Added `km >= 5` guard in pace condition |
| RISK-7: Missing translations for 6 languages | code-reviewer | Full translation table added in Task 4 |
| RISK-9: Artist already renders | code-reviewer | Clarified in Task 9 note + Notes section |
