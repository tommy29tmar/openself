/**
 * Strava data mapper.
 * Transforms Strava API responses into OpenSelf facts and episodic events.
 */

import type { EpisodicEventInput } from "../types";
import type { StravaProfile, StravaActivity, StravaStats } from "./client";

export type FactInput = {
  category: string;
  key: string;
  value: Record<string, unknown>;
};

// ── Profile ──────────────────────────────────────────────────────────

export function mapStravaProfile(profile: StravaProfile): FactInput[] {
  return [
    {
      category: "social",
      key: "strava-profile",
      value: {
        platform: "strava",
        label: `${profile.firstname} ${profile.lastname}`.trim(),
        location:
          [profile.city, profile.state, profile.country]
            .filter(Boolean)
            .join(", ") || undefined,
      },
    },
  ];
}

// ── Activities → Facts ───────────────────────────────────────────────

/**
 * Group activities by sport type and create one activity fact per sport.
 */
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

    const value: Record<string, unknown> = {
      name: sport,
      type: "sport",
      activityCount: count,
    };
    if (totalDistKm > 0) value.distanceKm = totalDistKm;
    if (totalTimeHrs > 0) value.timeHrs = totalTimeHrs;

    return {
      category: "activity",
      key: `strava-${sport.toLowerCase().replace(/\s+/g, "-")}`,
      value,
    };
  });
}

// ── Stats → Facts ────────────────────────────────────────────────────

export function mapStravaStats(stats: StravaStats): FactInput[] {
  const facts: FactInput[] = [];

  if (stats.all_run_totals.count > 0) {
    facts.push({
      category: "stat",
      key: "strava-distance",
      value: {
        label: "Total running distance",
        value: `${Math.round(stats.all_run_totals.distance / 1000)} km`,
      },
    });
  }

  const totalActivities =
    stats.all_run_totals.count +
    stats.all_ride_totals.count +
    stats.all_swim_totals.count;
  if (totalActivities > 0) {
    facts.push({
      category: "stat",
      key: "strava-activities",
      value: { label: "Total activities", value: String(totalActivities) },
    });
  }

  return facts;
}

// ── Activities → Episodic Events ─────────────────────────────────────

export function mapStravaActivityEvents(
  activities: StravaActivity[],
): EpisodicEventInput[] {
  const events: EpisodicEventInput[] = [];

  for (const a of activities) {
    const distKm = (a.distance / 1000).toFixed(1);
    const durationMin = Math.round(a.moving_time / 60);

    // Workout event
    events.push({
      externalId: `activity-${a.id}`,
      eventAtUnix: Math.floor(new Date(a.start_date).getTime() / 1000),
      eventAtHuman: a.start_date,
      actionType: "workout",
      narrativeSummary: `Completed a ${distKm}km ${a.sport_type} in ${durationMin} minutes`,
      entities: [a.sport_type],
    });

    // PR event (milestone)
    if (a.pr_count > 0) {
      events.push({
        externalId: `pr-${a.id}`,
        eventAtUnix: Math.floor(new Date(a.start_date).getTime() / 1000),
        eventAtHuman: a.start_date,
        actionType: "milestone",
        narrativeSummary: `Set ${a.pr_count} personal record${a.pr_count > 1 ? "s" : ""} in ${a.sport_type}`,
        entities: [a.sport_type],
      });
    }
  }

  return events;
}
