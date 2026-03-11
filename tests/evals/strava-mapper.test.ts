import { describe, it, expect } from "vitest";
import {
  mapStravaProfile,
  mapStravaActivities,
  mapStravaStats,
  mapStravaActivityEvents,
} from "@/lib/connectors/strava/mapper";
import type {
  StravaProfile,
  StravaActivity,
  StravaStats,
} from "@/lib/connectors/strava/client";

describe("Strava mapper", () => {
  // ── mapStravaProfile ───────────────────────────────────────────────

  describe("mapStravaProfile", () => {
    it("maps full profile to social fact", () => {
      const profile: StravaProfile = {
        id: 123,
        firstname: "Marco",
        lastname: "Rossi",
        city: "Rome",
        state: "Lazio",
        country: "Italy",
      };
      const facts = mapStravaProfile(profile);
      expect(facts).toHaveLength(1);
      expect(facts[0].category).toBe("social");
      expect(facts[0].key).toBe("strava-profile");
      expect(facts[0].value.platform).toBe("strava");
      expect(facts[0].value.label).toBe("Marco Rossi");
      expect(facts[0].value.location).toBe("Rome, Lazio, Italy");
    });

    it("handles null location fields", () => {
      const profile: StravaProfile = {
        id: 456,
        firstname: "Jane",
        lastname: "Doe",
        city: null,
        state: null,
        country: null,
      };
      const facts = mapStravaProfile(profile);
      expect(facts[0].value.location).toBeUndefined();
    });

    it("trims label whitespace", () => {
      const profile: StravaProfile = {
        id: 789,
        firstname: "  Test  ",
        lastname: "  User  ",
        city: null,
        state: null,
        country: null,
      };
      const facts = mapStravaProfile(profile);
      expect(facts[0].value.label).toBe("Test     User");
    });
  });

  // ── mapStravaActivities ────────────────────────────────────────────

  describe("mapStravaActivities", () => {
    const activities: StravaActivity[] = [
      {
        id: 1,
        name: "Morning Run",
        sport_type: "Run",
        distance: 10000,
        moving_time: 3600,
        elapsed_time: 3700,
        total_elevation_gain: 50,
        start_date: "2025-01-01T08:00:00Z",
        pr_count: 0,
        achievement_count: 0,
      },
      {
        id: 2,
        name: "Afternoon Run",
        sport_type: "Run",
        distance: 5000,
        moving_time: 1800,
        elapsed_time: 1900,
        total_elevation_gain: 20,
        start_date: "2025-01-02T15:00:00Z",
        pr_count: 1,
        achievement_count: 2,
      },
      {
        id: 3,
        name: "Bike Ride",
        sport_type: "Ride",
        distance: 50000,
        moving_time: 7200,
        elapsed_time: 7500,
        total_elevation_gain: 200,
        start_date: "2025-01-03T10:00:00Z",
        pr_count: 0,
        achievement_count: 0,
      },
    ];

    it("groups by sport type", () => {
      const facts = mapStravaActivities(activities);
      expect(facts).toHaveLength(2); // Run + Ride
    });

    it("creates interest facts with correct keys", () => {
      const facts = mapStravaActivities(activities);
      const runFact = facts.find((f) => f.key === "strava-run");
      const rideFact = facts.find((f) => f.key === "strava-ride");
      expect(runFact).toBeDefined();
      expect(rideFact).toBeDefined();
    });

    it("aggregates distance in km", () => {
      const facts = mapStravaActivities(activities);
      const runFact = facts.find((f) => f.key === "strava-run")!;
      expect(runFact.value.totalDistance).toBe(15); // (10000 + 5000) / 1000
    });

    it("aggregates time in hours", () => {
      const facts = mapStravaActivities(activities);
      const runFact = facts.find((f) => f.key === "strava-run")!;
      expect(runFact.value.totalTime).toBe(2); // (3600 + 1800) / 3600 ≈ 1.5 → rounds to 2
    });

    it("counts activities per sport", () => {
      const facts = mapStravaActivities(activities);
      const runFact = facts.find((f) => f.key === "strava-run")!;
      expect(runFact.value.activityCount).toBe(2);
    });

    it("normalizes sport type key (spaces → hyphens, lowercase)", () => {
      const trailRun: StravaActivity = {
        id: 4,
        name: "Trail Run",
        sport_type: "Trail Run",
        distance: 8000,
        moving_time: 3000,
        elapsed_time: 3200,
        total_elevation_gain: 300,
        start_date: "2025-01-04T09:00:00Z",
        pr_count: 0,
        achievement_count: 0,
      };
      const facts = mapStravaActivities([trailRun]);
      expect(facts[0].key).toBe("strava-trail-run");
    });

    it("returns empty for no activities", () => {
      expect(mapStravaActivities([])).toHaveLength(0);
    });
  });

  // ── mapStravaStats ─────────────────────────────────────────────────

  describe("mapStravaStats", () => {
    it("maps running distance stat", () => {
      const stats: StravaStats = {
        all_run_totals: { count: 100, distance: 500000, moving_time: 180000 },
        all_ride_totals: { count: 0, distance: 0, moving_time: 0 },
        all_swim_totals: { count: 0, distance: 0, moving_time: 0 },
      };
      const facts = mapStravaStats(stats);
      const distFact = facts.find((f) => f.key === "strava-distance");
      expect(distFact).toBeDefined();
      expect(distFact!.value.value).toBe("500 km");
    });

    it("maps total activities stat", () => {
      const stats: StravaStats = {
        all_run_totals: { count: 50, distance: 250000, moving_time: 90000 },
        all_ride_totals: { count: 30, distance: 200000, moving_time: 80000 },
        all_swim_totals: { count: 20, distance: 40000, moving_time: 36000 },
      };
      const facts = mapStravaStats(stats);
      const actFact = facts.find((f) => f.key === "strava-activities");
      expect(actFact).toBeDefined();
      expect(actFact!.value.value).toBe("100");
    });

    it("omits running distance when count is 0", () => {
      const stats: StravaStats = {
        all_run_totals: { count: 0, distance: 0, moving_time: 0 },
        all_ride_totals: { count: 10, distance: 100000, moving_time: 36000 },
        all_swim_totals: { count: 0, distance: 0, moving_time: 0 },
      };
      const facts = mapStravaStats(stats);
      expect(facts.find((f) => f.key === "strava-distance")).toBeUndefined();
      expect(facts.find((f) => f.key === "strava-activities")).toBeDefined();
    });

    it("returns empty when all counts are 0", () => {
      const stats: StravaStats = {
        all_run_totals: { count: 0, distance: 0, moving_time: 0 },
        all_ride_totals: { count: 0, distance: 0, moving_time: 0 },
        all_swim_totals: { count: 0, distance: 0, moving_time: 0 },
      };
      const facts = mapStravaStats(stats);
      expect(facts).toHaveLength(0);
    });
  });

  // ── mapStravaActivityEvents ────────────────────────────────────────

  describe("mapStravaActivityEvents", () => {
    it("creates workout events for each activity", () => {
      const activities: StravaActivity[] = [
        {
          id: 100,
          name: "Run",
          sport_type: "Run",
          distance: 10000,
          moving_time: 3000,
          elapsed_time: 3200,
          total_elevation_gain: 50,
          start_date: "2025-06-01T08:00:00Z",
          pr_count: 0,
          achievement_count: 0,
        },
      ];
      const events = mapStravaActivityEvents(activities);
      expect(events).toHaveLength(1);
      expect(events[0].externalId).toBe("activity-100");
      expect(events[0].actionType).toBe("workout");
      expect(events[0].narrativeSummary).toContain("10.0km");
      expect(events[0].narrativeSummary).toContain("Run");
      expect(events[0].narrativeSummary).toContain("50 minutes");
      expect(events[0].entities).toEqual(["Run"]);
    });

    it("creates milestone events for PRs", () => {
      const activities: StravaActivity[] = [
        {
          id: 200,
          name: "Fast Run",
          sport_type: "Run",
          distance: 5000,
          moving_time: 1200,
          elapsed_time: 1300,
          total_elevation_gain: 10,
          start_date: "2025-06-02T07:00:00Z",
          pr_count: 2,
          achievement_count: 5,
        },
      ];
      const events = mapStravaActivityEvents(activities);
      expect(events).toHaveLength(2); // workout + milestone
      const prEvent = events.find((e) => e.actionType === "milestone")!;
      expect(prEvent.externalId).toBe("pr-200");
      expect(prEvent.narrativeSummary).toContain("2 personal records");
      expect(prEvent.entities).toEqual(["Run"]);
    });

    it("uses singular 'record' for pr_count=1", () => {
      const activities: StravaActivity[] = [
        {
          id: 300,
          name: "PR Run",
          sport_type: "Run",
          distance: 10000,
          moving_time: 2400,
          elapsed_time: 2500,
          total_elevation_gain: 20,
          start_date: "2025-06-03T09:00:00Z",
          pr_count: 1,
          achievement_count: 1,
        },
      ];
      const events = mapStravaActivityEvents(activities);
      const prEvent = events.find((e) => e.actionType === "milestone")!;
      expect(prEvent.narrativeSummary).toContain("1 personal record in");
      expect(prEvent.narrativeSummary).not.toContain("records");
    });

    it("sets correct unix timestamp from ISO start_date", () => {
      const activities: StravaActivity[] = [
        {
          id: 400,
          name: "Run",
          sport_type: "Run",
          distance: 5000,
          moving_time: 1800,
          elapsed_time: 1900,
          total_elevation_gain: 10,
          start_date: "2025-01-01T00:00:00Z",
          pr_count: 0,
          achievement_count: 0,
        },
      ];
      const events = mapStravaActivityEvents(activities);
      expect(events[0].eventAtUnix).toBe(
        Math.floor(new Date("2025-01-01T00:00:00Z").getTime() / 1000),
      );
      expect(events[0].eventAtHuman).toBe("2025-01-01T00:00:00Z");
    });

    it("skips milestone for activities with pr_count=0", () => {
      const activities: StravaActivity[] = [
        {
          id: 500,
          name: "Easy Run",
          sport_type: "Run",
          distance: 3000,
          moving_time: 1200,
          elapsed_time: 1300,
          total_elevation_gain: 5,
          start_date: "2025-06-04T08:00:00Z",
          pr_count: 0,
          achievement_count: 0,
        },
      ];
      const events = mapStravaActivityEvents(activities);
      expect(events).toHaveLength(1);
      expect(events[0].actionType).toBe("workout");
    });

    it("returns empty for no activities", () => {
      expect(mapStravaActivityEvents([])).toHaveLength(0);
    });
  });
});
