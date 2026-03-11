import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  createConnector,
  getConnectorStatus,
} from "@/lib/connectors/connector-service";
import { hasPendingJob } from "@/lib/connectors/idempotency";
import { enqueueJob } from "@/lib/worker";
import { connectorError } from "@/lib/connectors/api-errors";
import { resolveAuthenticatedConnectorScope } from "@/lib/connectors/route-auth";
import {
  validateRssUrl,
  validateResolvedIp,
} from "@/lib/connectors/rss/url-validator";
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

  // Check if RSS connector already exists with a different URL
  const existingStatuses = getConnectorStatus(ownerKey);
  const existingRss = existingStatuses.find((c) => c.connectorType === "rss");

  if (existingRss) {
    // Check if URL changed — if so, reset sync state
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
      // We need to check if the feed_url changed.
      // If so, reset syncCursor, lastSync, and delete old connector_items.
      // createConnector will update credentials below.
      // But we need to reset sync state if URL changed.
      const needsReset = true; // Always reset on re-subscribe to be safe
      if (needsReset) {
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
  }

  // Create or update the connector
  const connector = createConnector(
    ownerKey,
    "rss",
    { feed_url: feedUrl },
  );

  // Idempotency: skip if sync already in progress
  if (hasPendingJob(ownerKey)) {
    return NextResponse.json({
      success: true,
      message: "RSS feed connected. Sync already in progress.",
      connectorId: connector.id,
    });
  }

  // Enqueue initial sync
  enqueueJob("connector_sync", { ownerKey, connectorId: connector.id });

  return NextResponse.json({
    success: true,
    message: "RSS feed connected. Initial sync queued.",
    connectorId: connector.id,
  });
}
