// src/lib/connectors/linkedin-zip/activity-mapper.ts
import { createHash } from "node:crypto";
import type { InsertEventInput } from "@/lib/services/episodic-service";
import { normalizeLinkedInDate } from "./date-normalizer";

/**
 * Subset of InsertEventInput suitable for connector activity mapping.
 * ownerKey and sessionId are added by the caller (importLinkedInZip).
 */
export type EpisodicInput = Omit<InsertEventInput, "ownerKey" | "sessionId"> & {
  source: string;
};

/**
 * Parse a LinkedIn date string into a Unix timestamp (seconds).
 * Returns null if the date cannot be parsed.
 */
function parseLinkedInDate(dateStr: string): number | null {
  const normalized = normalizeLinkedInDate(dateStr);
  if (!normalized) return null;

  let isoDate: string;
  if (/^\d{4}$/.test(normalized)) {
    isoDate = `${normalized}-01-01T00:00:00Z`;
  } else if (/^\d{4}-\d{2}$/.test(normalized)) {
    isoDate = `${normalized}-01T00:00:00Z`;
  } else {
    isoDate = `${normalized}T00:00:00Z`;
  }

  const ts = Math.floor(new Date(isoDate).getTime() / 1000);
  return Number.isNaN(ts) ? null : ts;
}

/**
 * Generate a stable external ID for dedup across re-imports.
 * Format: li:<prefix>:<16-char sha256 hex>
 */
function stableExternalId(prefix: string, ...parts: string[]): string {
  return `li:${prefix}:${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16)}`;
}

/**
 * Map LinkedIn Certifications.csv rows to episodic events.
 * Skips rows without a name or any date.
 */
export function mapCertificationsToEpisodic(
  rows: Record<string, string>[],
): EpisodicInput[] {
  const result: EpisodicInput[] = [];

  for (const row of rows) {
    const name = row["Name"] ?? "";
    const finishedOn = row["Finished On"] ?? "";
    const startedOn = row["Started On"] ?? "";
    const dateStr = finishedOn || startedOn;
    const authority = row["Authority"] ?? "";

    if (!name.trim()) continue;

    const eventAt = parseLinkedInDate(dateStr);
    if (!eventAt) continue;

    result.push({
      eventAtUnix: eventAt,
      eventAtHuman: new Date(eventAt * 1000).toISOString(),
      actionType: "certification",
      narrativeSummary: `Earned certification: ${name}${authority ? ` (${authority})` : ""}`.slice(0, 200),
      source: "linkedin_zip",
      externalId: stableExternalId("cert", name, authority, dateStr),
    });
  }

  return result;
}

/**
 * Map LinkedIn Articles.csv rows to episodic events.
 * Skips rows without a title or any date.
 */
export function mapArticlesToEpisodic(
  rows: Record<string, string>[],
): EpisodicInput[] {
  const result: EpisodicInput[] = [];

  for (const row of rows) {
    const title = row["Title"] ?? "";
    const dateStr = row["PublishedDate"] ?? row["Date"] ?? "";
    const url = row["Url"] ?? "";

    if (!title.trim()) continue;

    const eventAt = parseLinkedInDate(dateStr);
    if (!eventAt) continue;

    result.push({
      eventAtUnix: eventAt,
      eventAtHuman: new Date(eventAt * 1000).toISOString(),
      actionType: "publication",
      narrativeSummary: `Published article: ${title}`.slice(0, 200),
      source: "linkedin_zip",
      externalId: stableExternalId("article", title, url),
    });
  }

  return result;
}
