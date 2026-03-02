import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { getConnectorStatus } from "@/lib/connectors/connector-service";
import { hasPendingJob, isSyncRateLimited } from "@/lib/connectors/idempotency";
import { enqueueJob } from "@/lib/worker";

export async function POST(req: NextRequest) {
  const scope = resolveOwnerScope(req);
  if (!scope) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  const ownerKey = scope.cognitiveOwnerKey;
  const statuses = getConnectorStatus(ownerKey);
  const github = statuses.find(c => c.connectorType === "github" && c.status === "connected");

  if (!github) {
    return NextResponse.json(
      { success: false, code: "NOT_CONNECTED", error: "GitHub not connected." },
      { status: 404 },
    );
  }

  // Idempotency: reject if a sync job is already queued or running
  if (hasPendingJob(ownerKey)) {
    return NextResponse.json(
      { success: false, code: "ALREADY_SYNCING", error: "A sync is already in progress.", retryable: true },
      { status: 409 },
    );
  }

  // Rate limit: reject if last sync was less than 60s ago
  if (isSyncRateLimited(github.lastSync)) {
    return NextResponse.json(
      { success: false, code: "RATE_LIMITED", error: "Please wait before syncing again.", retryable: true },
      { status: 429 },
    );
  }

  enqueueJob("connector_sync", { ownerKey });

  return NextResponse.json({ success: true, message: "Sync queued" });
}
