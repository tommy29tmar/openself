# Connector Section Mapping Fix — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Spotify and Strava connector facts so they render in the correct page sections (Music and Activities) instead of all being dumped into Interests as context-less pills.

**Architecture:** The Music section component (`Music.tsx`) and Activities section component (`Activities.tsx`) already exist with 3 variants each, along with their page-composer builders (`buildMusicSection`, `buildActivitiesSection`). The issue is purely in the mapper layer: both connectors output `category: "interest"` instead of `"music"`/`"activity"`, and the value shapes don't match what the components expect. Additionally, connector-created facts should be `public` visibility (user explicitly connected the service), not `proposed`.

**Tech Stack:** TypeScript, Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/connectors/spotify/mapper.ts` | Modify | Change artists/tracks category to `music`, adjust value shape, drop genre facts |
| `src/lib/connectors/spotify/client.ts` | Modify | Widen `SpotifyArtist.genres` type to `string[] \| null` (matches real API) |
| `src/lib/connectors/strava/mapper.ts` | Modify | Change activities category to `activity`, add `description` from stats |
| `src/lib/services/kb-service.ts` | Modify | Add `visibility` override to `createFact` options + upsert path |
| `src/lib/connectors/connector-fact-writer.ts` | Modify | Pass `visibility: "public"` to `createFact` |
| `src/lib/services/page-composer.ts` | Modify | Add `"sport"` to ACTIVITY_TYPE_L10N map |
| `src/lib/i18n/ui-strings.ts` | Modify | Add `activitySport` key (8 languages) |
| `src/lib/connectors/spotify/sync.ts` | Modify | Remove `mapSpotifyGenres` call and genre-related stale tracking |
| `tests/evals/spotify-mapper.test.ts` | Modify | Update expected categories/shapes, remove genre tests |
| `tests/evals/strava-mapper.test.ts` | Modify | Update expected category and value shapes |
| `tests/evals/spotify-stale-cleanup.test.ts` | Modify | Update ALL 3 fixture categories from `interest` to `music` (lines 138, 162, 173) |
| `tests/evals/activity-type-l10n.test.ts` | Modify | Change "sport" unknown type test to "outdoor" (sport is now L10N'd) |
| `tests/evals/connector-fact-writer.test.ts` | Modify | Add `visibility: "public"` assertion |
| `tests/evals/connector-section-mapping.test.ts` | Create | Integration: facts with `music`/`activity` category produce correct sections |
| `db/migrations/0032_connector_fact_categories.sql` | Create | Startup migration: fix categories + visibility for existing connector facts |
| `src/lib/db/migrate.ts` | Modify | Bump `EXPECTED_SCHEMA_VERSION` from 31 to 32 |

---

## Chunk 1: Spotify Mapper — Category & Value Shape

### Task 1: Spotify Mapper — Artists to `music` category

**Files:**
- Modify: `src/lib/connectors/spotify/mapper.ts:33-43`
- Test: `tests/evals/spotify-mapper.test.ts:89-106`

The Music section component expects `{ title, artist?, note?, url? }`. The page-composer builder extracts: `title = str(v.title) ?? str(v.name)`, `artist = str(v.artist)`, `note = str(v.note) ?? str(v.description)`, `url = str(v.url)`.

For artists: `title` = artist name (via `name` fallback), `note` = genres joined, no `artist` field.

- [ ] **Step 1: Update mapper test expectations**

In `tests/evals/spotify-mapper.test.ts`, update `mapSpotifyTopArtists` tests:

```typescript
describe("mapSpotifyTopArtists", () => {
  it("maps artists to music facts", () => {
    const facts = mapSpotifyTopArtists(artists);
    expect(facts).toHaveLength(3);
    expect(facts[0]).toEqual({
      category: "music",
      key: "sp-artist-a1",
      value: {
        title: "Radiohead",
        note: "alternative rock, art rock",
        url: "https://open.spotify.com/artist/a1",
      },
    });
  });

  it("handles empty list", () => {
    expect(mapSpotifyTopArtists([])).toEqual([]);
  });

  it("omits note when genres are empty", () => {
    const noGenres: SpotifyArtist[] = [
      { id: "x", name: "X", genres: [], external_urls: { spotify: "url" } },
    ];
    const facts = mapSpotifyTopArtists(noGenres);
    expect(facts[0].value.note).toBeUndefined();
  });

  it("handles null genres", () => {
    const nullGenres: SpotifyArtist[] = [
      { id: "x", name: "X", genres: null, external_urls: { spotify: "url" } },
    ];
    const facts = mapSpotifyTopArtists(nullGenres);
    expect(facts[0].value.note).toBeUndefined();
  });
});
```

**Pre-requisite:** Widen `SpotifyArtist.genres` type in `src/lib/connectors/spotify/client.ts:25` from `string[]` to `string[] | null` to match Spotify's real API (which can return `null`). This also makes the existing `a.genres ?? []` defensive code properly typed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/spotify-mapper.test.ts --reporter=verbose`
Expected: FAIL — `category: "interest"` doesn't match `"music"`, value shape differs.

- [ ] **Step 3: Update `mapSpotifyTopArtists` implementation**

In `src/lib/connectors/spotify/mapper.ts`, replace `mapSpotifyTopArtists`:

```typescript
export function mapSpotifyTopArtists(artists: SpotifyArtist[]): FactInput[] {
  return artists.map((a) => {
    const genres = a.genres ?? [];
    const value: Record<string, unknown> = {
      title: a.name,
      url: a.external_urls.spotify,
    };
    if (genres.length > 0) {
      value.note = genres.join(", ");
    }
    return {
      category: "music",
      key: `sp-artist-${a.id}`,
      value,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/spotify-mapper.test.ts --reporter=verbose`
Expected: PASS for `mapSpotifyTopArtists` tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/spotify/mapper.ts tests/evals/spotify-mapper.test.ts
git commit -m "fix: map Spotify artists to music category with correct value shape"
```

### Task 2: Spotify Mapper — Tracks to `music` category

**Files:**
- Modify: `src/lib/connectors/spotify/mapper.ts:47-57`
- Test: `tests/evals/spotify-mapper.test.ts:109-139`

For tracks: `title` = track name, `artist` = artists joined as string, `url` = Spotify URL.

- [ ] **Step 1: Update mapper test expectations**

In `tests/evals/spotify-mapper.test.ts`, update `mapSpotifyTopTracks` tests:

```typescript
describe("mapSpotifyTopTracks", () => {
  it("maps tracks to music facts", () => {
    const facts = mapSpotifyTopTracks(tracks);
    expect(facts).toHaveLength(2);
    expect(facts[0]).toEqual({
      category: "music",
      key: "sp-track-t1",
      value: {
        title: "Everything In Its Right Place",
        artist: "Radiohead",
        url: "https://open.spotify.com/track/t1",
      },
    });
  });

  it("joins multiple artists with comma", () => {
    const multiArtistTrack: SpotifyTrack[] = [
      {
        id: "t3",
        name: "Collab Track",
        artists: [
          { id: "a1", name: "Artist A" },
          { id: "a2", name: "Artist B" },
        ],
        external_urls: { spotify: "url" },
      },
    ];
    const facts = mapSpotifyTopTracks(multiArtistTrack);
    expect(facts[0].value.artist).toBe("Artist A, Artist B");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/spotify-mapper.test.ts --reporter=verbose`
Expected: FAIL — value shape differs.

- [ ] **Step 3: Update `mapSpotifyTopTracks` implementation**

In `src/lib/connectors/spotify/mapper.ts`, replace `mapSpotifyTopTracks`:

```typescript
export function mapSpotifyTopTracks(tracks: SpotifyTrack[]): FactInput[] {
  return tracks.map((t) => ({
    category: "music",
    key: `sp-track-${t.id}`,
    value: {
      title: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      url: t.external_urls.spotify,
    },
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/spotify-mapper.test.ts --reporter=verbose`
Expected: PASS for `mapSpotifyTopTracks` tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/spotify/mapper.ts tests/evals/spotify-mapper.test.ts
git commit -m "fix: map Spotify tracks to music category with title/artist shape"
```

### Task 3: Remove Spotify Genre Mapping

**Files:**
- Modify: `src/lib/connectors/spotify/mapper.ts:59-78` (remove `mapSpotifyGenres`)
- Modify: `src/lib/connectors/spotify/sync.ts:32,118-119,136` (remove genre usage)
- Remove tests: `tests/evals/spotify-mapper.test.ts:141-182`

Genre facts are noise — they don't render well in any section (no artist, no context), and the artist `note` field now contains genres. The stale-cleanup tracking logic for `sp-genre-*` keys also becomes unnecessary.

- [ ] **Step 1: Remove genre tests from mapper test file**

In `tests/evals/spotify-mapper.test.ts`, delete the entire `describe("mapSpotifyGenres", ...)` block (lines 141-182).

- [ ] **Step 2: Remove `mapSpotifyGenres` from mapper**

In `src/lib/connectors/spotify/mapper.ts`:
- Delete the `mapSpotifyGenres` function (lines 59-78)
- Remove its export

- [ ] **Step 3: Remove genre usage from sync.ts and update stale comments**

In `src/lib/connectors/spotify/sync.ts`:
- Remove `mapSpotifyGenres` from the import (line 32)
- Remove `const genreFacts = mapSpotifyGenres(mediumArtists);` (line 118)
- Remove `...genreFacts` from `allFacts` array (line 119)
- Update doc-comment on line 5: remove `/sp-genre` from "Archives stale sp-artist/sp-track/sp-genre facts"
- Update inline comment on line 135: remove `sp-genre-*` from the parenthetical list

- [ ] **Step 4: Run all Spotify tests**

Run: `npx vitest run tests/evals/spotify-mapper.test.ts tests/evals/spotify-sync.test.ts tests/evals/spotify-stale-cleanup.test.ts --reporter=verbose`
Expected: PASS (sync tests don't reference genres directly).

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/spotify/mapper.ts src/lib/connectors/spotify/sync.ts tests/evals/spotify-mapper.test.ts
git commit -m "refactor: remove Spotify genre facts — genres now embedded in artist notes"
```

### Task 4: Update stale-cleanup test fixtures

**Files:**
- Modify: `tests/evals/spotify-stale-cleanup.test.ts:138,162,173`

The stale cleanup test has 3 fixtures with `category: "interest"` for `sp-artist-*` facts. All must be updated.

- [ ] **Step 1: Update ALL fixture categories**

In `tests/evals/spotify-stale-cleanup.test.ts`:
- Line 138: change `'interest'` to `'music'` in the raw SQL INSERT for `sp-artist-staletest`
- Line 162: change `'interest'` to `'music'` in the raw SQL INSERT for `sp-artist-reappear`
- Line 173: change `category: "interest"` to `category: "music"` in the `createFact` call

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/evals/spotify-stale-cleanup.test.ts --reporter=verbose`
Expected: PASS — the stale cleanup logic doesn't filter by category.

- [ ] **Step 3: Commit**

```bash
git add tests/evals/spotify-stale-cleanup.test.ts
git commit -m "test: update stale-cleanup fixture to music category"
```

---

## Chunk 2: Strava Mapper — Category & Value Shape

### Task 5: Strava Mapper — Activities to `activity` category

**Files:**
- Modify: `src/lib/connectors/strava/mapper.ts:39-64`
- Test: `tests/evals/strava-mapper.test.ts:65-156`

The Activities section component expects `{ name, activityType?, frequency?, description? }`. The page-composer builder extracts: `name = str(v.name) ?? str(v.value)`, `activityType = str(v.activityType) ?? str(v.type)`, `frequency = str(v.frequency)`, `description = str(v.description)`.

The `type: "sport"` already maps via `str(v.type)` in the composer. Need to add a `description` string with stats summary.

- [ ] **Step 1: Update mapper test expectations**

In `tests/evals/strava-mapper.test.ts`, update the `mapStravaActivities` tests:

```typescript
describe("mapStravaActivities", () => {
    const activities: StravaActivity[] = [
      {
        id: 1, name: "Morning Run", sport_type: "Run",
        distance: 10000, moving_time: 3600, elapsed_time: 3700,
        total_elevation_gain: 50, start_date: "2025-01-01T08:00:00Z",
        pr_count: 0, achievement_count: 0,
      },
      {
        id: 2, name: "Afternoon Run", sport_type: "Run",
        distance: 5000, moving_time: 1800, elapsed_time: 1900,
        total_elevation_gain: 20, start_date: "2025-01-02T15:00:00Z",
        pr_count: 1, achievement_count: 2,
      },
      {
        id: 3, name: "Bike Ride", sport_type: "Ride",
        distance: 50000, moving_time: 7200, elapsed_time: 7500,
        total_elevation_gain: 200, start_date: "2025-01-03T10:00:00Z",
        pr_count: 0, achievement_count: 0,
      },
    ];

    it("groups by sport type", () => {
      const facts = mapStravaActivities(activities);
      expect(facts).toHaveLength(2); // Run + Ride
    });

    it("uses activity category", () => {
      const facts = mapStravaActivities(activities);
      expect(facts.every((f) => f.category === "activity")).toBe(true);
    });

    it("creates facts with correct keys", () => {
      const facts = mapStravaActivities(activities);
      expect(facts.find((f) => f.key === "strava-run")).toBeDefined();
      expect(facts.find((f) => f.key === "strava-ride")).toBeDefined();
    });

    it("includes type sport in value", () => {
      const facts = mapStravaActivities(activities);
      const runFact = facts.find((f) => f.key === "strava-run")!;
      expect(runFact.value.type).toBe("sport");
    });

    it("composes description from stats", () => {
      const facts = mapStravaActivities(activities);
      const runFact = facts.find((f) => f.key === "strava-run")!;
      // 2 activities, 15 km, 2 hrs
      expect(runFact.value.description).toBe("2 activities · 15 km · 2 hrs");
    });

    it("omits 0 km from description", () => {
      const zeroDistance: StravaActivity[] = [{
        id: 10, name: "Yoga", sport_type: "Yoga",
        distance: 0, moving_time: 3600, elapsed_time: 3600,
        total_elevation_gain: 0, start_date: "2025-01-01T08:00:00Z",
        pr_count: 0, achievement_count: 0,
      }];
      const facts = mapStravaActivities(zeroDistance);
      expect(facts[0].value.description).toBe("1 activity · 1 hr");
    });

    it("omits 0 hrs from description for very short activities", () => {
      const quickActivity: StravaActivity[] = [{
        id: 11, name: "Quick Stretch", sport_type: "Yoga",
        distance: 0, moving_time: 30, elapsed_time: 45,
        total_elevation_gain: 0, start_date: "2025-01-01T08:00:00Z",
        pr_count: 0, achievement_count: 0,
      }];
      const facts = mapStravaActivities(quickActivity);
      // 30 seconds → Math.round(30/3600) = 0 → omitted
      expect(facts[0].value.description).toBe("1 activity");
    });

    it("uses singular 'activity' for count 1", () => {
      const single: StravaActivity[] = [{
        id: 10, name: "Run", sport_type: "Run",
        distance: 5000, moving_time: 1800, elapsed_time: 1900,
        total_elevation_gain: 10, start_date: "2025-01-01T08:00:00Z",
        pr_count: 0, achievement_count: 0,
      }];
      const facts = mapStravaActivities(single);
      expect(facts[0].value.description).toContain("1 activity");
      expect(facts[0].value.description).not.toContain("activities");
    });

    it("normalizes sport type key (spaces → hyphens, lowercase)", () => {
      const trailRun: StravaActivity = {
        id: 4, name: "Trail Run", sport_type: "Trail Run",
        distance: 8000, moving_time: 3000, elapsed_time: 3200,
        total_elevation_gain: 300, start_date: "2025-01-04T09:00:00Z",
        pr_count: 0, achievement_count: 0,
      };
      const facts = mapStravaActivities([trailRun]);
      expect(facts[0].key).toBe("strava-trail-run");
    });

    it("returns empty for no activities", () => {
      expect(mapStravaActivities([])).toHaveLength(0);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/strava-mapper.test.ts --reporter=verbose`
Expected: FAIL — `category: "interest"` doesn't match, `description` missing.

- [ ] **Step 3: Update `mapStravaActivities` implementation**

In `src/lib/connectors/strava/mapper.ts`, replace `mapStravaActivities`:

```typescript
export function mapStravaActivities(
  activities: StravaActivity[],
): FactInput[] {
  const sportGroups = new Map<string, StravaActivity[]>();
  for (const a of activities) {
    const group = sportGroups.get(a.sport_type) ?? [];
    group.push(a);
    sportGroups.set(a.sport_type, group);
  }

  return [...sportGroups.entries()].map(([sport, acts]) => {
    const totalDistKm = Math.round(
      acts.reduce((sum, a) => sum + a.distance, 0) / 1000,
    );
    const totalTimeHrs = Math.round(
      acts.reduce((sum, a) => sum + a.moving_time, 0) / 3600,
    );
    const count = acts.length;

    // Compose human-readable description from stats
    const parts: string[] = [];
    parts.push(`${count} ${count === 1 ? "activity" : "activities"}`);
    if (totalDistKm > 0) parts.push(`${totalDistKm} km`);
    if (totalTimeHrs > 0) parts.push(`${totalTimeHrs} ${totalTimeHrs === 1 ? "hr" : "hrs"}`);

    return {
      category: "activity",
      key: `strava-${sport.toLowerCase().replace(/\s+/g, "-")}`,
      value: {
        name: sport,
        type: "sport",
        description: parts.join(" · "),
      },
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/strava-mapper.test.ts --reporter=verbose`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/strava/mapper.ts tests/evals/strava-mapper.test.ts
git commit -m "fix: map Strava activities to activity category with description"
```

### Task 6: Add `activitySport` L10N key

**Files:**
- Modify: `src/lib/i18n/ui-strings.ts` (add `activitySport` to UiStrings type + all 8 language blocks)
- Modify: `src/lib/services/page-composer.ts:1245-1249` (add `sport` to ACTIVITY_TYPE_L10N)

The Activities section composer has an `ACTIVITY_TYPE_L10N` map that translates activity type values. Currently only has `volunteering`, `mentoring`, `hobby`. Need to add `sport`.

- [ ] **Step 1: Add `activitySport` to UiStrings type and all 8 languages**

In `src/lib/i18n/ui-strings.ts`:
- Add `activitySport: string;` to the `UiStrings` type (after `activityHobby`)
- Add the translation to each language block:
  - en: `activitySport: "sport"`
  - it: `activitySport: "sport"`
  - de: `activitySport: "Sport"`
  - fr: `activitySport: "sport"`
  - es: `activitySport: "deporte"`
  - pt: `activitySport: "esporte"`
  - ja: `activitySport: "スポーツ"`
  - zh: `activitySport: "运动"`

- [ ] **Step 2: Add `sport` to ACTIVITY_TYPE_L10N in page-composer.ts**

In `src/lib/services/page-composer.ts`, in `buildActivitiesSection` around line 1245, add `sport` to the map:

```typescript
const ACTIVITY_TYPE_L10N: Record<string, string> = {
  volunteering: t.activityVolunteering,
  mentoring: t.activityMentoring,
  hobby: t.activityHobby,
  sport: t.activitySport,
};
```

- [ ] **Step 3: Update `activity-type-l10n.test.ts` — change "unknown type" test case**

In `tests/evals/activity-type-l10n.test.ts`, the test "passes through unknown activity types unchanged" (line 35-43) uses `activityType: "sport"` as its "unknown type" example. Now that `sport` is being added to the L10N map, this test will break. Change the test to use a genuinely unknown type:

```typescript
  it("passes through unknown activity types unchanged", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "a2", value: { name: "Climbing", activityType: "outdoor" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const act = page.sections.find((s) => s.type === "activities");
    const items = (act!.content as { items: { name: string; activityType?: string }[] }).items;
    expect(items[0].activityType).toBe("outdoor");
  });
```

- [ ] **Step 4: Run full test suite to verify no regressions**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All tests PASS (L10N key count tests may need updating if they count keys).

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/ui-strings.ts src/lib/services/page-composer.ts tests/evals/activity-type-l10n.test.ts
git commit -m "feat: add sport activity type L10N for Activities section"
```

---

## Chunk 3: Connector Visibility — Public by Default

### Task 7: Add visibility override to `createFact`

**Files:**
- Modify: `src/lib/services/kb-service.ts:98,159-163`
- Modify: `src/lib/connectors/connector-fact-writer.ts:46-49`

Connector facts should be `public` because the user explicitly connected the service (implicit consent). Currently all facts get `proposed` visibility via hardcoded `mode: "onboarding"`.

**Scope note:** This visibility change affects ALL connector types (GitHub, LinkedIn, RSS, Spotify, Strava) because they all go through `batchCreateFacts` → `createFact`. This is intentional — the user explicitly connected each service, so `public` is the correct default for all connector-sourced facts.

- [ ] **Step 1: Add visibility assertion to connector-fact-writer test**

In `tests/evals/connector-fact-writer.test.ts`, update the existing test "writes facts with source='connector' and actor='connector'" to also assert visibility:

```typescript
  it("writes facts with source='connector', actor='connector', visibility='public'", async () => {
    const report = await batchCreateFacts(
      [{ category: "skill", key: "ts", value: { name: "TypeScript" } }],
      scope,
      "testuser",
      "en",
    );

    expect(mockCreateFact).toHaveBeenCalledTimes(1);
    const [input, sessionId, profileId, options] = mockCreateFact.mock.calls[0];
    expect(input.source).toBe("connector");
    expect(options?.actor).toBe("connector");
    expect(options?.visibility).toBe("public");
    expect(sessionId).toBe("anchor-sess");
    expect(profileId).toBe("prof-1");
    expect(report.factsWritten).toBe(1);
    expect(report.factsSkipped).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/connector-fact-writer.test.ts --reporter=verbose`
Expected: FAIL — `options.visibility` is `undefined`, not `"public"`.

- [ ] **Step 3: Add `visibility` to createFact options**

In `src/lib/services/kb-service.ts`, change the options type at line 98:

```typescript
  options?: { actor?: Actor; visibility?: Visibility },
```

Add the import for `Visibility` from `@/lib/visibility/policy` if not already imported (it is — line 13).

Then at line 159-163, change:

```typescript
  const visibility = options?.visibility ?? initialVisibility({
    mode: "onboarding",
    category: normalized.canonical,
    confidence,
  });
```

**IMPORTANT:** Also update the `onConflictDoUpdate` visibility clause (around line 193) to respect the override on upsert. The current CASE expression preserves existing non-private visibility, which would prevent upgrading `proposed` facts to `public` on re-sync:

```typescript
  .onConflictDoUpdate({
    target: [facts.sessionId, facts.category, facts.key],
    set: {
      value: input.value,
      source: input.source ?? "chat",
      confidence,
      profileId: effectiveProfileId,
      visibility: options?.visibility
        ? sql`${options.visibility}`
        : sql`CASE WHEN ${facts.visibility} = 'private' THEN ${visibility} ELSE ${facts.visibility} END`,
      archivedAt: null,
      updatedAt: now,
    },
  })
```

This ensures that when `options.visibility` is explicitly set (as connectors do), it always wins — even over existing `proposed` visibility.

- [ ] **Step 3: Pass visibility in connector-fact-writer**

In `src/lib/connectors/connector-fact-writer.ts`, change the `createFact` call at line 46-49:

```typescript
      await createFact(
        { ...input, source: "connector" },
        scope.knowledgePrimaryKey,
        scope.cognitiveOwnerKey,
        { actor: "connector", visibility: "public" },
      );
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/evals/connector-fact-writer.test.ts tests/evals/spotify-sync.test.ts tests/evals/strava-sync.test.ts --reporter=verbose`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/kb-service.ts src/lib/connectors/connector-fact-writer.ts
git commit -m "fix: connector facts default to public visibility"
```

---

## Chunk 4: Integration Test & DB Migration

### Task 8: Integration test — facts produce correct sections

**Files:**
- Create: `tests/evals/connector-section-mapping.test.ts`

Verify end-to-end: music/activity category facts → page-composer → correct section types.

- [ ] **Step 1: Write integration test**

```typescript
import { describe, it, expect } from "vitest";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import type { FactRow } from "@/lib/services/kb-service";

function fakeFact(overrides: Partial<FactRow>): FactRow {
  return {
    id: "f-" + Math.random().toString(36).slice(2),
    category: "identity",
    key: "test",
    value: {},
    source: "connector",
    confidence: 1,
    visibility: "public",
    sortOrder: 0,
    parentFactId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

describe("connector section mapping", () => {
  it("music category facts produce a music section", () => {
    const facts: FactRow[] = [
      fakeFact({ category: "identity", key: "name", value: { name: "Test" } }),
      fakeFact({
        category: "music",
        key: "sp-artist-1",
        value: { title: "Radiohead", note: "alt rock", url: "https://example.com" },
      }),
      fakeFact({
        category: "music",
        key: "sp-track-1",
        value: { title: "Creep", artist: "Radiohead", url: "https://example.com" },
      }),
    ];
    const page = composeOptimisticPage(facts, "testuser", "en");
    const musicSection = page.sections.find((s) => s.type === "music");
    expect(musicSection).toBeDefined();
    expect((musicSection!.content as { items: unknown[] }).items).toHaveLength(2);
  });

  it("activity category facts produce an activities section", () => {
    const facts: FactRow[] = [
      fakeFact({ category: "identity", key: "name", value: { name: "Test" } }),
      fakeFact({
        category: "activity",
        key: "strava-run",
        value: { name: "Run", type: "sport", description: "5 activities · 15 km · 2 hrs" },
      }),
    ];
    const page = composeOptimisticPage(facts, "testuser", "en");
    const activitiesSection = page.sections.find((s) => s.type === "activities");
    expect(activitiesSection).toBeDefined();
  });

  it("music and activity facts do NOT appear in interests section", () => {
    const facts: FactRow[] = [
      fakeFact({ category: "identity", key: "name", value: { name: "Test" } }),
      fakeFact({ category: "interest", key: "ai", value: { name: "AI" } }),
      fakeFact({ category: "music", key: "sp-1", value: { title: "Song" } }),
      fakeFact({ category: "activity", key: "strava-run", value: { name: "Run" } }),
    ];
    const page = composeOptimisticPage(facts, "testuser", "en");
    const interestsSection = page.sections.find((s) => s.type === "interests");
    if (interestsSection) {
      const items = (interestsSection.content as { items: { name: string }[] }).items;
      const names = items.map((i) => i.name);
      expect(names).not.toContain("Song");
      expect(names).not.toContain("Run");
      expect(names).toContain("AI");
    }
  });

  it("bio does not mention music or activity items", () => {
    const facts: FactRow[] = [
      fakeFact({ category: "identity", key: "name", value: { name: "Test User" } }),
      fakeFact({ category: "music", key: "sp-1", value: { title: "Radiohead" } }),
      fakeFact({ category: "activity", key: "strava-run", value: { name: "Run" } }),
    ];
    const page = composeOptimisticPage(facts, "testuser", "en");
    const bioSection = page.sections.find((s) => s.type === "bio");
    if (bioSection) {
      const text = (bioSection.content as { text: string }).text;
      expect(text).not.toContain("Radiohead");
      expect(text).not.toContain("Run");
    }
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/evals/connector-section-mapping.test.ts --reporter=verbose`
Expected: PASS (all facts route to correct sections).

- [ ] **Step 3: Commit**

```bash
git add tests/evals/connector-section-mapping.test.ts
git commit -m "test: integration tests for connector section mapping"
```

### Task 9: Numbered SQL migration for existing facts

**Files:**
- Create: `db/migrations/0032_connector_fact_categories.sql`

**CRITICAL:** This must be a numbered SQL migration (not a runtime script) to prevent duplicate rows during deploy. The unique constraint is `(session_id, category, key)` — if the mapper changes category from `interest` to `music` but the DB still has old `interest` rows, the upsert won't match and will INSERT duplicates. The migration runs at app startup (via `runMigrations`) BEFORE any sync can execute, eliminating this race condition.

The migration wraps all updates in a single transaction and uses `WHERE NOT EXISTS` guards to handle the (unlikely) case where a target row already exists with the new category.

- [ ] **Step 1: Create migration file**

Create `db/migrations/0032_connector_fact_categories.sql`:

```sql
-- Fix connector fact categories: interest → music/activity
-- Must run BEFORE new mapper code syncs to prevent duplicate rows.
-- Unique constraint: (session_id, category, key)
-- Guards: WHERE NOT EXISTS prevents violation if target row already exists.

-- Spotify artists: interest → music
-- Guard uses profile_id (not session_id) because there are TWO unique constraints:
--   1. (session_id, category, key) — inline from migration 0006
--   2. (profile_id, category, key) — uniq_facts_profile_category_key from migration 0010
-- Using profile_id covers both constraints (same profile = at most one connector session).
UPDATE facts SET category = 'music', updated_at = datetime('now')
WHERE category = 'interest'
  AND key LIKE 'sp-artist-%'
  AND archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM facts f2
    WHERE f2.profile_id = facts.profile_id
      AND f2.category = 'music'
      AND f2.key = facts.key
  );

-- Spotify tracks: interest → music
UPDATE facts SET category = 'music', updated_at = datetime('now')
WHERE category = 'interest'
  AND key LIKE 'sp-track-%'
  AND archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM facts f2
    WHERE f2.profile_id = facts.profile_id
      AND f2.category = 'music'
      AND f2.key = facts.key
  );

-- Spotify genres: archive (no longer mapped)
UPDATE facts SET archived_at = datetime('now'), updated_at = datetime('now')
WHERE category = 'interest'
  AND key LIKE 'sp-genre-%'
  AND archived_at IS NULL;

-- Strava activities: interest → activity
UPDATE facts SET category = 'activity', updated_at = datetime('now')
WHERE category = 'interest'
  AND key LIKE 'strava-%'
  AND json_extract(value, '$.type') = 'sport'
  AND archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM facts f2
    WHERE f2.profile_id = facts.profile_id
      AND f2.category = 'activity'
      AND f2.key = facts.key
  );

-- Upgrade all connector facts visibility: proposed → public
-- Scope: ALL connector types (GitHub, LinkedIn, RSS, Spotify, Strava)
-- Rationale: user explicitly connected each service = implicit consent for public
UPDATE facts SET visibility = 'public', updated_at = datetime('now')
WHERE source = 'connector'
  AND visibility = 'proposed'
  AND archived_at IS NULL;
```

- [ ] **Step 2: Bump `EXPECTED_SCHEMA_VERSION` to 32**

In `src/lib/db/migrate.ts`, update the schema version constant from `31` to `32`. This ensures the worker (follower mode) waits via `awaitSchema()` until the leader has applied migration 0032 before starting to process sync requests.

- [ ] **Step 3: Verify migration numbering**

Run: `ls db/migrations/ | tail -3`
Expected: `0032_connector_fact_categories.sql` is the last file (after 0031).

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0032_connector_fact_categories.sql src/lib/db/migrate.ts
git commit -m "migration: fix connector fact categories and visibility (0032)"
```

### Task 10: Full test suite verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All tests PASS. Check for any snapshot failures.

- [ ] **Step 2: Update snapshots if needed**

Run: `npx vitest run --update` (only if snapshot failures are from expected changes).

- [ ] **Step 3: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Final commit if any fixes**

```bash
git add -A
git commit -m "fix: resolve test snapshot updates from category changes"
```

---

## Note: Genre Stale Archival

After removing `mapSpotifyGenres`, existing `sp-genre-*` facts are archived by migration 0032 at startup. The stale pipeline (`computeStaleArchival`) would also eventually archive them after 3 consecutive syncs — the migration just makes it immediate.

---

## Deploy Safety: Migration-First Approach

**Why a numbered migration instead of a runtime script?**

The unique constraint on facts is `(session_id, category, key)`. If new code deploys first and a sync runs before the migration script executes, the mapper would emit facts with category `music` (e.g., `sp-artist-xyz`), but the DB still has rows with category `interest` and the same key. The upsert's `onConflictDoUpdate` wouldn't match (different category tuple), so SQLite would INSERT a duplicate row — same artist, two facts with different categories.

Migration 0032 runs at app startup via `runMigrations()` (in `src/lib/db/index.ts`), BEFORE the web server or worker starts processing requests. This guarantees:
1. Existing facts are moved to the correct category
2. The first sync with new mapper code will match via upsert (same category tuple)
3. No manual intervention required after deploy

## Post-Implementation: Deploy Sequence

After merge to main:

1. Deploy web + worker via Coolify API
2. Both containers auto-run migration 0032 at startup (before serving requests)
3. Next connector sync will auto-recompose with correct sections
4. Verify the page at `openself.dev/tommaso-rinversi` shows Music and Activities sections
