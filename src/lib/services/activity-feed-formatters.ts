import type { FeedItem } from "./activity-feed-types";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function connectorLabel(type: string): string {
  const labels: Record<string, string> = {
    github: "GitHub",
    linkedin_zip: "LinkedIn",
    rss: "RSS",
    spotify: "Spotify",
    strava: "Strava",
  };
  return labels[type] ?? capitalizeFirst(type);
}

export function formatFeedForContext(items: FeedItem[]): string {
  if (items.length === 0) return "";

  const syncs = items.filter((i) => i.type === "connector_error");
  const pending = items.filter((i) => i.category === "actionable" && i.status === "pending");

  const lines: string[] = [];

  // RECENT ACTIVITY — max 5 sync items
  if (syncs.length > 0) {
    lines.push("RECENT ACTIVITY:");
    for (const s of syncs.slice(0, 5)) {
      const d = s.detail;
      if (d.type === "connector_error") {
        lines.push(`- ${connectorLabel(d.connectorType)} sync failed ${relativeTime(s.createdAt)}: ${d.error}`);
      }
    }
  }

  // PENDING ACTIONS — count by type
  if (pending.length > 0) {
    const counts: Record<string, number> = {};
    for (const p of pending) {
      counts[p.type] = (counts[p.type] ?? 0) + 1;
    }
    const parts: string[] = [];
    if (counts.conformity_proposal) parts.push(`${counts.conformity_proposal} page improvement${counts.conformity_proposal > 1 ? "s" : ""}`);
    if (counts.soul_proposal) parts.push(`${counts.soul_proposal} soul proposal${counts.soul_proposal > 1 ? "s" : ""}`);
    if (counts.episodic_pattern) parts.push(`${counts.episodic_pattern} pattern${counts.episodic_pattern > 1 ? "s" : ""}`);
    lines.push(`PENDING ACTIONS: ${parts.join(", ")}`);
  }

  return lines.join("\n");
}
