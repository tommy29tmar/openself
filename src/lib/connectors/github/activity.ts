import type { GitHubEvent } from "./client";
import type { InsertEventInput } from "@/lib/services/episodic-service";

type SignificantEvent = GitHubEvent & { __significanceType: string };

/**
 * Significance filter: only merged PRs, releases, and new repos.
 */
export function filterSignificantEvents(events: GitHubEvent[]): SignificantEvent[] {
  const result: SignificantEvent[] = [];
  for (const e of events) {
    if (e.type === "PullRequestEvent") {
      const pr = e.payload.pull_request as Record<string, unknown> | undefined;
      if (e.payload.action === "closed" && pr?.merged === true) {
        result.push({ ...e, __significanceType: "code_merge" });
      }
    } else if (e.type === "ReleaseEvent") {
      result.push({ ...e, __significanceType: "code_release" });
    } else if (e.type === "CreateEvent" && e.payload.ref_type === "repository") {
      result.push({ ...e, __significanceType: "code_create_repo" });
    }
  }
  return result;
}

/**
 * Map significant GitHub events to episodic event inputs.
 */
export function mapToEpisodicEvents(
  events: SignificantEvent[],
): Array<Omit<InsertEventInput, "ownerKey" | "sessionId"> & { source: string }> {
  return events.map((e) => {
    const eventAtUnix = Math.floor(new Date(e.created_at).getTime() / 1000);
    let summary: string;

    if (e.__significanceType === "code_merge") {
      const pr = e.payload.pull_request as Record<string, unknown>;
      summary = `Merged PR #${pr.number}: ${String(pr.title ?? "").slice(0, 100)} (${e.repo.name})`;
    } else if (e.__significanceType === "code_release") {
      const rel = e.payload.release as Record<string, unknown>;
      summary = `Released ${String(rel.tag_name ?? "")} for ${e.repo.name}`;
    } else {
      summary = `Created repository ${e.repo.name}`;
    }

    return {
      eventAtUnix,
      eventAtHuman: e.created_at,
      actionType: e.__significanceType,
      narrativeSummary: summary.slice(0, 200),
      entities: [e.repo.name],
      source: "github",
      externalId: e.id,
    };
  });
}
