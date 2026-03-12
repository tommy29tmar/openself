import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  createConnector,
  getConnectorStatus,
} from "@/lib/connectors/connector-service";
import { recoverStaleConnectorJobs, hasPendingJob } from "@/lib/connectors/idempotency";
import { enqueueJob } from "@/lib/worker";
import { connectorError } from "@/lib/connectors/api-errors";
import { resolveAuthenticatedConnectorScope } from "@/lib/connectors/route-auth";
import {
  validateRssUrl,
  validateResolvedIp,
} from "@/lib/connectors/rss/url-validator";
import { validateFeedUrl } from "@/lib/connectors/rss/parser";
import { db, sqlite } from "@/lib/db";
import { connectors } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const scope = resolveAuthenticatedConnectorScope(req);
  if (!scope) {
    return connectorError("AUTH_REQUIRED", "Authentication required.", 403, false);
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return connectorError("INVALID_BODY", "Invalid request body.", 400, false);
  }

  const feedUrl = body.url?.trim();
  if (!feedUrl) {
    return connectorError("MISSING_URL", "Feed URL is required.", 400, false);
  }

  // SSRF validation: URL format
  const urlCheck = validateRssUrl(feedUrl);
  if (!urlCheck.valid) {
    return connectorError("INVALID_URL", urlCheck.error, 400, false);
  }

  // SSRF validation: DNS resolution
  const dnsCheck = await validateResolvedIp(new URL(feedUrl).hostname);
  if (!dnsCheck.valid) {
    return connectorError("BLOCKED_URL", dnsCheck.error, 400, false);
  }

  const ownerKey = scope.cognitiveOwnerKey;

  // ── Idempotency: bail out BEFORE any destructive mutations ──
  recoverStaleConnectorJobs(ownerKey);
  if (hasPendingJob(ownerKey)) {
    const existingStatuses = getConnectorStatus(ownerKey);
    const existingRss = existingStatuses.find((c) => c.connectorType === "rss");
    return NextResponse.json(
      {
        success: true,
        message: "RSS feed connected. Sync already in progress.",
        connectorId: existingRss?.id ?? null,
      },
      { status: 409 },
    );
  }

  // ── Feed validation: fetch + parse probe ──
  const validation = await validateFeedUrl(feedUrl);
  if (!validation.ok) {
    if (validation.reason === "parse_error") {
      return connectorError(
        "INVALID_FEED",
        "This URL does not appear to be an RSS or Atom feed.",
        400,
        false,
      );
    }
    // network_error → retriable
    return connectorError(
      "FEED_UNREACHABLE",
      "Could not reach this URL. Try again later.",
      502,
      true,
    );
  }

  // ── Existing connector reset (if re-subscribing) ──
  const existingStatuses = getConnectorStatus(ownerKey);
  const existingRss = existingStatuses.find((c) => c.connectorType === "rss");

  if (existingRss) {
    const existingRow = db
      .select()
      .from(connectors)
      .where(
        and(
          eq(connectors.ownerKey, ownerKey),
          eq(connectors.connectorType, "rss"),
        ),
      )
      .get();

    if (existingRow) {
      // Always reset sync state on re-subscribe to be safe
      db.update(connectors)
        .set({
          syncCursor: null,
          lastSync: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(connectors.id, existingRow.id))
        .run();

      sqlite
        .prepare("DELETE FROM connector_items WHERE connector_id = ?")
        .run(existingRow.id);
    }
  }

  // Create or update the connector
  const connector = createConnector(
    ownerKey,
    "rss",
    { feed_url: feedUrl },
  );

  // Enqueue initial sync
  const jobId = enqueueJob("connector_sync", { ownerKey, connectorId: connector.id });
  if (!jobId) {
    return NextResponse.json({
      success: true,
      message: "RSS feed connected. Sync already in progress.",
      connectorId: connector.id,
    });
  }

  return NextResponse.json({
    success: true,
    message: "RSS feed connected. Initial sync queued.",
    connectorId: connector.id,
  });
}
