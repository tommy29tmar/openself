import { describe, it, expect } from "vitest";
import {
  filterSignificantEvents,
  mapToEpisodicEvents,
} from "@/lib/connectors/github/activity";

const baseEvent = (
  type: string,
  payload: Record<string, unknown> = {},
) => ({
  id: "1",
  type,
  created_at: "2026-03-10T12:00:00Z",
  repo: { name: "user/repo" },
  payload,
});

describe("filterSignificantEvents", () => {
  it("keeps PullRequestEvent with action=closed and merged=true", () => {
    const events = [
      baseEvent("PullRequestEvent", {
        action: "closed",
        pull_request: { merged: true, title: "Add auth" },
      }),
    ];
    expect(filterSignificantEvents(events).length).toBe(1);
  });

  it("rejects PullRequestEvent with action=opened", () => {
    const events = [
      baseEvent("PullRequestEvent", { action: "opened" }),
    ];
    expect(filterSignificantEvents(events).length).toBe(0);
  });

  it("keeps ReleaseEvent", () => {
    const events = [
      baseEvent("ReleaseEvent", { release: { tag_name: "v1.0" } }),
    ];
    expect(filterSignificantEvents(events).length).toBe(1);
  });

  it("rejects WatchEvent, PushEvent, etc.", () => {
    const events = [
      baseEvent("WatchEvent"),
      baseEvent("PushEvent"),
      baseEvent("ForkEvent"),
    ];
    expect(filterSignificantEvents(events).length).toBe(0);
  });
});

describe("mapToEpisodicEvents", () => {
  it("maps merged PR to episodic event with source=github", () => {
    const events = [
      baseEvent("PullRequestEvent", {
        action: "closed",
        pull_request: {
          merged: true,
          title: "Add authentication module",
          number: 42,
        },
      }),
    ];
    const result = mapToEpisodicEvents(filterSignificantEvents(events));
    expect(result.length).toBe(1);
    expect(result[0].source).toBe("github");
    expect(result[0].actionType).toBe("code_merge");
    expect(result[0].narrativeSummary).toContain(
      "Add authentication module",
    );
  });
});
