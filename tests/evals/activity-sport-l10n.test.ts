import { describe, it, expect } from "vitest";
import { getUiL10n } from "@/lib/i18n/ui-strings";
import { buildActivitiesSection } from "@/lib/services/page-composer";
import type { FactRow } from "@/lib/services/kb-service";
import type { ActivityItem } from "@/lib/page-config/content-types";

// ── Helper ────────────────────────────────────────────────────────────

function activityFact(
  opts: { key?: string; value: Record<string, unknown> },
): FactRow {
  return {
    id: `fact-${Math.random().toString(36).slice(2, 8)}`,
    category: "activity",
    key: opts.key ?? "strava-run",
    value: opts.value,
    source: null,
    confidence: null,
    visibility: "public",
    sortOrder: null,
    parentFactId: null,
    archivedAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

function getActivitiesItems(facts: FactRow[], language: string): ActivityItem[] {
  const section = buildActivitiesSection(facts, language);
  if (!section) return [];
  return (section.content as unknown as { items: ActivityItem[] }).items;
}

// ── L10N Key Tests ────────────────────────────────────────────────────

describe("Sport name L10N keys", () => {
  it("localizes Run to Italian", () => {
    const t = getUiL10n("it");
    expect(t.sportRun).toBe("Corsa");
  });

  it("localizes Walk to German", () => {
    const t = getUiL10n("de");
    expect(t.sportWalk).toBe("Gehen");
  });

  it("localizes Ride to French", () => {
    const t = getUiL10n("fr");
    expect(t.sportRide).toBe("Cyclisme");
  });

  it("localizes Swim to Spanish", () => {
    const t = getUiL10n("es");
    expect(t.sportSwim).toBe("Natación");
  });

  it("localizes Hike to Portuguese", () => {
    const t = getUiL10n("pt");
    expect(t.sportHike).toBe("Trilha");
  });

  it("localizes Yoga to Japanese", () => {
    const t = getUiL10n("ja");
    expect(t.sportYoga).toBe("ヨガ");
  });

  it("localizes TrailRun to Chinese", () => {
    const t = getUiL10n("zh");
    expect(t.sportTrailRun).toBe("越野跑");
  });

  it("localizes WeightTraining to English", () => {
    const t = getUiL10n("en");
    expect(t.sportWeightTraining).toBe("Weight Training");
  });

  it("has elevationLabel for all languages", () => {
    for (const lang of ["en", "it", "de", "fr", "es", "pt", "ja", "zh"]) {
      const t = getUiL10n(lang);
      expect(t.elevationLabel).toBe("D+");
    }
  });

  it("has paceLabel for Italian", () => {
    const t = getUiL10n("it");
    expect(t.paceLabel).toBe("ritmo");
  });

  it("falls back to English for unknown language", () => {
    const t = getUiL10n("xx");
    expect(t.sportRun).toBe("Running");
    expect(t.sportWalk).toBe("Walking");
  });
});

describe("Sport name L10N mapping coverage", () => {
  const SPORT_KEYS = [
    "sportRun", "sportWalk", "sportRide", "sportSwim", "sportHike",
    "sportYoga", "sportTrailRun", "sportWeightTraining", "sportWorkout", "sportOther",
  ] as const;

  for (const lang of ["en", "it", "de", "fr", "es", "pt", "ja", "zh"]) {
    it(`has all sport keys for ${lang}`, () => {
      const t = getUiL10n(lang);
      for (const key of SPORT_KEYS) {
        expect(t[key], `Missing ${key} in ${lang}`).toBeDefined();
        expect(t[key].length, `Empty ${key} in ${lang}`).toBeGreaterThan(0);
      }
    });
  }
});

// ── Composer Integration Tests ────────────────────────────────────────

describe("buildActivitiesSection — sport name L10N", () => {
  it("localizes known sport names", () => {
    const facts = [
      activityFact({ key: "strava-run", value: { name: "Run", activityCount: 10, distanceKm: 50, timeHrs: 5 } }),
      activityFact({ key: "strava-walk", value: { name: "Walk", activityCount: 5, distanceKm: 20, timeHrs: 4 } }),
    ];
    const items = getActivitiesItems(facts, "it");
    expect(items[0].name).toBe("Corsa");
    expect(items[1].name).toBe("Camminata");
  });

  it("passes through unknown sport names unchanged", () => {
    const facts = [
      activityFact({ key: "strava-kitesurf", value: { name: "Kitesurf", activityCount: 3, distanceKm: 10 } }),
    ];
    const items = getActivitiesItems(facts, "it");
    expect(items[0].name).toBe("Kitesurf");
  });

  it("localizes Trail Run (space-separated variant)", () => {
    const facts = [
      activityFact({ key: "strava-trail-run", value: { name: "Trail Run", activityCount: 5, distanceKm: 30, timeHrs: 4 } }),
    ];
    const items = getActivitiesItems(facts, "de");
    expect(items[0].name).toBe("Trailrunning");
  });
});

describe("buildActivitiesSection — elevation", () => {
  it("shows elevation in description when elevationM > 0", () => {
    const facts = [
      activityFact({ key: "strava-run", value: { name: "Run", activityCount: 10, distanceKm: 50, timeHrs: 5, elevationM: 1200 } }),
    ];
    const items = getActivitiesItems(facts, "en");
    expect(items[0].description).toContain("1200m D+");
  });

  it("omits elevation when elevationM is 0", () => {
    const facts = [
      activityFact({ key: "strava-walk", value: { name: "Walk", activityCount: 5, distanceKm: 20, timeHrs: 4, elevationM: 0 } }),
    ];
    const items = getActivitiesItems(facts, "en");
    expect(items[0].description).not.toContain("D+");
  });

  it("omits elevation when elevationM is absent", () => {
    const facts = [
      activityFact({ key: "strava-walk", value: { name: "Walk", activityCount: 5, distanceKm: 20, timeHrs: 4 } }),
    ];
    const items = getActivitiesItems(facts, "en");
    expect(items[0].description).not.toContain("D+");
  });
});

describe("buildActivitiesSection — pace", () => {
  it("shows pace for Run with ≥ 5km", () => {
    const facts = [
      activityFact({ key: "strava-run", value: { name: "Run", activityCount: 10, distanceKm: 100, timeHrs: 10 } }),
    ];
    const items = getActivitiesItems(facts, "en");
    // 10*60/100 = 6 min/km → "6:00/km pace"
    expect(items[0].description).toContain("6:00/km pace");
  });

  it("shows pace for TrailRun", () => {
    const facts = [
      activityFact({ key: "strava-trail-run", value: { name: "TrailRun", activityCount: 5, distanceKm: 50, timeHrs: 8 } }),
    ];
    const items = getActivitiesItems(facts, "en");
    // 8*60/50 = 9.6 min/km → 9:36/km
    expect(items[0].description).toContain("9:36/km pace");
  });

  it("does NOT show pace for Walk", () => {
    const facts = [
      activityFact({ key: "strava-walk", value: { name: "Walk", activityCount: 5, distanceKm: 20, timeHrs: 4 } }),
    ];
    const items = getActivitiesItems(facts, "en");
    expect(items[0].description).not.toContain("/km");
  });

  it("does NOT show pace for Ride", () => {
    const facts = [
      activityFact({ key: "strava-ride", value: { name: "Ride", activityCount: 10, distanceKm: 200, timeHrs: 10 } }),
    ];
    const items = getActivitiesItems(facts, "en");
    expect(items[0].description).not.toContain("/km");
  });

  it("treadmill: no pace when distanceKm is absent (no division by zero)", () => {
    const facts = [
      activityFact({ key: "strava-run", value: { name: "Run", activityCount: 5, timeHrs: 3 } }),
    ];
    const items = getActivitiesItems(facts, "en");
    expect(items[0].description).not.toContain("/km");
  });

  it("low-km guard: no pace when distanceKm < 5", () => {
    const facts = [
      activityFact({ key: "strava-run", value: { name: "Run", activityCount: 2, distanceKm: 3, timeHrs: 1 } }),
    ];
    const items = getActivitiesItems(facts, "en");
    expect(items[0].description).not.toContain("/km");
  });

  it("handles seconds=60 rollover in pace", () => {
    // 7 * 60 / 80 = 5.25 min/km → 5 min 15 sec → "5:15/km"
    const facts = [
      activityFact({ key: "strava-run", value: { name: "Run", activityCount: 20, distanceKm: 80, timeHrs: 7 } }),
    ];
    const items = getActivitiesItems(facts, "en");
    expect(items[0].description).toContain("5:15/km pace");
  });

  it("uses localized pace label", () => {
    const facts = [
      activityFact({ key: "strava-run", value: { name: "Run", activityCount: 10, distanceKm: 100, timeHrs: 10 } }),
    ];
    const items = getActivitiesItems(facts, "it");
    expect(items[0].description).toContain("/km ritmo");
  });
});

describe("buildActivitiesSection — activityType suppression", () => {
  it("suppresses activityType badge when activityCount is present (Strava fact)", () => {
    const facts = [
      activityFact({ key: "strava-run", value: { name: "Run", type: "sport", activityCount: 10, distanceKm: 50 } }),
    ];
    const items = getActivitiesItems(facts, "en");
    expect(items[0].activityType).toBeUndefined();
  });

  it("shows activityType badge when activityCount is absent (non-Strava fact)", () => {
    const facts = [
      activityFact({ key: "manual-yoga", value: { name: "Yoga", activityType: "hobby" } }),
    ];
    const items = getActivitiesItems(facts, "en");
    expect(items[0].activityType).toBe("hobby");
  });
});

describe("buildActivitiesSection — description parts joined with ·", () => {
  it("joins all parts with · separator", () => {
    const facts = [
      activityFact({
        key: "strava-run",
        value: { name: "Run", activityCount: 10, distanceKm: 50, timeHrs: 5, elevationM: 500 },
      }),
    ];
    const items = getActivitiesItems(facts, "en");
    const parts = items[0].description!.split(" · ");
    expect(parts.length).toBeGreaterThanOrEqual(4); // count, km, hrs, elevation (+ maybe pace)
    expect(parts[0]).toBe("10 activities");
    expect(parts[1]).toBe("50 km");
    expect(parts[2]).toBe("5 hrs");
    expect(parts[3]).toBe("500m D+");
  });
});
