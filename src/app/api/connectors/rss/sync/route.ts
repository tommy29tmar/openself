import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getConnectorStatus } from "@/lib/connectors/connector-service";
import { hasPendingJob, isSyncRateLimited } from "@/lib/connectors/idempotency";
import { enqueueJob } from "@/lib/worker";
import { connectorError } from "@/lib/connectors/api-errors";
import { resolveAuthenticatedConnectorScope } from "@/lib/connectors/route-auth";

export async function POST(req: NextRequest) {
  const scope = resolveAuthenticatedConnectorScope(req);
  if (!scope) {
    return connectorError(
      "AUTH_REQUIRED",
      "Authentication required.",
      403,
      false,
    );
  }

  const ownerKey = scope.cognitiveOwnerKey;
  const statuses = getConnectorStatus(ownerKey);
  // Accept both "connected" AND "error" status (error connectors retry on sync)
  const rss = statuses.find(
    (c) =>
      c.connectorType === "rss" &&
      (c.status === "connected" || c.status === "error"),
  );

  if (!rss) {
    return connectorError(
      "NOT_CONNECTED",
      "RSS feed not connected.",
      404,
      true,
    );
  }

  // Idempotency: reject if a sync job is already queued or running
  if (hasPendingJob(ownerKey)) {
    return connectorError(
      "ALREADY_SYNCING",
      "A sync is already in progress.",
      409,
      true,
    );
  }

  // Rate limit: reject if last sync was less than 60s ago
  if (isSyncRateLimited(rss.lastSync)) {
    return connectorError(
      "RATE_LIMITED",
      "Please wait before syncing again.",
      429,
      true,
    );
  }

  enqueueJob("connector_sync", { ownerKey, connectorId: rss.id });

  return NextResponse.json({ success: true, message: "Sync queued" });
}
