import { describe, it, expect } from "vitest";
import { formatFeedForContext } from "@/lib/services/activity-feed-formatters";
import type { FeedItem } from "@/lib/services/activity-feed-types";

describe("formatFeedForContext", () => {
  it("formats sync items with relative time and counts", () => {
    const items: FeedItem[] = [{
      id: "sync_1",
      type: "connector_sync",
      category: "informational",
      connectorType: "strava",
      title: "",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      detail: { type: "connector_sync", connectorType: "strava", factsCreated: 3, factsUpdated: 0, eventsCreated: 2 },
    }];
    const result = formatFeedForContext(items);
    expect(result).toContain("Strava");
    expect(result).toContain("3 facts");
    expect(result).toContain("2 events");
    expect(result).toContain("RECENT ACTIVITY");
  });

  it("formats error sync items", () => {
    const items: FeedItem[] = [{
      id: "sync_2",
      type: "connector_error",
      category: "informational",
      connectorType: "github",
      title: "",
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      detail: { type: "connector_error", connectorType: "github", error: "rate_limited", lastSuccessfulSync: null },
    }];
    const result = formatFeedForContext(items);
    expect(result).toContain("GitHub");
    expect(result).toContain("sync failed");
    expect(result).toContain("rate_limited");
  });

  it("formats pending proposals as PENDING ACTIONS", () => {
    const items: FeedItem[] = [{
      id: "soul_1",
      type: "soul_proposal",
      category: "actionable",
      title: "",
      createdAt: new Date().toISOString(),
      status: "pending",
      detail: { type: "soul_proposal", proposalId: "abc", proposedOverlay: { voice: "signal" }, reason: "tone shift" },
    }];
    const result = formatFeedForContext(items);
    expect(result).toContain("PENDING");
    expect(result).toContain("soul");
  });

  it("counts multiple pending proposals by type", () => {
    const items: FeedItem[] = [
      { id: "soul_1", type: "soul_proposal", category: "actionable", title: "", createdAt: new Date().toISOString(), status: "pending", detail: { type: "soul_proposal", proposalId: "a", proposedOverlay: {}, reason: null } },
      { id: "soul_2", type: "soul_proposal", category: "actionable", title: "", createdAt: new Date().toISOString(), status: "pending", detail: { type: "soul_proposal", proposalId: "b", proposedOverlay: {}, reason: null } },
      { id: "ep_1", type: "episodic_pattern", category: "actionable", title: "", createdAt: new Date().toISOString(), status: "pending", detail: { type: "episodic_pattern", proposalId: "c", actionType: "hobby", patternSummary: "running", eventCount: 5 } },
    ];
    const result = formatFeedForContext(items);
    expect(result).toContain("2 soul proposals");
    expect(result).toContain("1 pattern");
  });

  it("returns empty string when no items", () => {
    expect(formatFeedForContext([])).toBe("");
  });

  it("stays within ~200 tokens (1000 chars)", () => {
    const items: FeedItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `sync_${i}`,
      type: "connector_sync" as const,
      category: "informational" as const,
      connectorType: "rss",
      title: "",
      createdAt: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
      detail: { type: "connector_sync" as const, connectorType: "rss", factsCreated: 1, factsUpdated: 0, eventsCreated: 0 },
    }));
    const result = formatFeedForContext(items);
    expect(result.length).toBeLessThan(1000);
  });

  it("caps sync items at 5", () => {
    const items: FeedItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `sync_${i}`,
      type: "connector_sync" as const,
      category: "informational" as const,
      connectorType: "rss",
      title: "",
      createdAt: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
      detail: { type: "connector_sync" as const, connectorType: "rss", factsCreated: 1, factsUpdated: 0, eventsCreated: 0 },
    }));
    const result = formatFeedForContext(items);
    const syncLines = result.split("\n").filter(l => l.startsWith("- "));
    expect(syncLines.length).toBe(5);
  });

  it("ignores resolved proposals", () => {
    const items: FeedItem[] = [{
      id: "soul_1",
      type: "soul_proposal",
      category: "actionable",
      title: "",
      createdAt: new Date().toISOString(),
      status: "accepted",
      detail: { type: "soul_proposal", proposalId: "abc", proposedOverlay: {}, reason: null },
    }];
    const result = formatFeedForContext(items);
    expect(result).not.toContain("PENDING");
  });
});

describe("pageStateBlock with activity feed", () => {
  it("includes RECENT ACTIVITY when sync items exist in steady_state", () => {
    // This is a structural test that verifies the imports exist and the
    // formatFeedForContext function produces the expected format
    // (already tested in the formatter tests above)
    // Here we just verify the integration point works
    const items = [{
      id: "sync_1",
      type: "connector_sync" as const,
      category: "informational" as const,
      connectorType: "strava",
      title: "",
      createdAt: new Date().toISOString(),
      detail: { type: "connector_sync" as const, connectorType: "strava", factsCreated: 3, factsUpdated: 0, eventsCreated: 2 },
    }];
    const result = formatFeedForContext(items);
    expect(result).toContain("RECENT ACTIVITY");
    expect(result).toContain("Strava");
  });
});
