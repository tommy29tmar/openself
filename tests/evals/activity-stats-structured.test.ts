import { describe, it, expect, vi } from "vitest";

/**
 * Activity stats structured data preservation (BUG-3).
 * Verifies that Strava-structured activity facts preserve numeric data
 * through the composition pipeline as `stats` field.
 */

vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/services/media-service", () => ({ getProfileAvatar: vi.fn() }));

import { buildActivitiesSection } from "@/lib/services/page-composer";

function makeActivityFact(key: string, value: Record<string, unknown>) {
  return {
    id: `fact-${key}`,
    sessionId: "s1",
    category: "activity",
    key,
    value,
    visibility: "public",
    source: "connector",
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    profileId: null,
  };
}

describe("buildActivitiesSection structured stats", () => {
  it("preserves Strava structured data in stats field", () => {
    const facts = [
      makeActivityFact("strava-run", {
        name: "Run",
        type: "sport",
        activityCount: 42,
        distanceKm: 350,
        timeHrs: 35,
        elevationM: 1200,
      }),
    ];

    const section = buildActivitiesSection(facts as any, "en");
    expect(section).not.toBeNull();

    const content = section!.content as { items: any[] };
    const item = content.items[0];

    // Stats should be preserved as structured data
    expect(item.stats).toBeDefined();
    expect(item.stats.activityCount).toBe(42);
    expect(item.stats.distanceKm).toBe(350);
    expect(item.stats.timeHrs).toBe(35);
    expect(item.stats.elevationM).toBe(1200);
  });

  it("computes pace for running activities", () => {
    const facts = [
      makeActivityFact("strava-run", {
        name: "Run",
        activityCount: 10,
        distanceKm: 50,
        timeHrs: 5,
      }),
    ];

    const section = buildActivitiesSection(facts as any, "en");
    const content = section!.content as { items: any[] };
    const item = content.items[0];

    // 5h / 50km = 6 min/km
    expect(item.stats.pace).toBe("6:00/km");
  });

  it("does NOT compute pace for non-running activities", () => {
    const facts = [
      makeActivityFact("strava-ride", {
        name: "Ride",
        activityCount: 20,
        distanceKm: 500,
        timeHrs: 25,
      }),
    ];

    const section = buildActivitiesSection(facts as any, "en");
    const content = section!.content as { items: any[] };
    const item = content.items[0];

    expect(item.stats).toBeDefined();
    expect(item.stats.pace).toBeUndefined();
  });

  it("also builds fallback description string", () => {
    const facts = [
      makeActivityFact("strava-run", {
        name: "Run",
        activityCount: 10,
        distanceKm: 50,
        timeHrs: 5,
      }),
    ];

    const section = buildActivitiesSection(facts as any, "en");
    const content = section!.content as { items: any[] };
    const item = content.items[0];

    // Description should be a human-readable string
    expect(item.description).toBeTruthy();
    expect(item.description).toContain("10");
    expect(item.description).toContain("50 km");
  });

  it("does NOT produce stats for non-structured facts", () => {
    const facts = [
      makeActivityFact("yoga", {
        name: "Yoga",
        type: "sport",
        frequency: "weekly",
        description: "Morning yoga routine",
      }),
    ];

    const section = buildActivitiesSection(facts as any, "en");
    const content = section!.content as { items: any[] };
    const item = content.items[0];

    expect(item.stats).toBeUndefined();
    expect(item.description).toBe("Morning yoga routine");
  });

  it("omits zero-value stats fields", () => {
    const facts = [
      makeActivityFact("strava-swim", {
        name: "Swim",
        activityCount: 5,
        distanceKm: 0,
        timeHrs: 3,
      }),
    ];

    const section = buildActivitiesSection(facts as any, "en");
    const content = section!.content as { items: any[] };
    const stats = content.items[0].stats;

    expect(stats.activityCount).toBe(5);
    expect(stats.distanceKm).toBeUndefined(); // 0 is omitted
    expect(stats.timeHrs).toBe(3);
  });
});
