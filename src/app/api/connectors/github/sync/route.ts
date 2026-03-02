import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { getConnectorStatus } from "@/lib/connectors/connector-service";
import { hasPendingJob, isSyncRateLimited } from "@/lib/connectors/idempotency";
import { enqueueJob } from "@/lib/worker";
import { connectorError } from "@/lib/connectors/api-errors";

export async function POST(req: NextRequest) {
  const scope = resolveOwnerScope(req);
  if (!scope) {
    return connectorError("AUTH_REQUIRED", "Authentication required.", 403, false);
  }

  const ownerKey = scope.cognitiveOwnerKey;
  const statuses = getConnectorStatus(ownerKey);
  const github = statuses.find(c => c.connectorType === "github" && c.status === "connected");

  if (!github) {
    return connectorError("NOT_CONNECTED", "GitHub not connected.", 404, true);
  }

  // Idempotency: reject if a sync job is already queued or running
  if (hasPendingJob(ownerKey)) {
    return connectorError("ALREADY_SYNCING", "A sync is already in progress.", 409, true);
  }

  // Rate limit: reject if last sync was less than 60s ago
  if (isSyncRateLimited(github.lastSync)) {
    return connectorError("RATE_LIMITED", "Please wait before syncing again.", 429, true);
  }

  enqueueJob("connector_sync", { ownerKey });

  return NextResponse.json({ success: true, message: "Sync queued" });
}
