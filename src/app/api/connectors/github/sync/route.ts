import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { getConnectorStatus } from "@/lib/connectors/connector-service";
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

  enqueueJob("connector_sync", { ownerKey });

  return NextResponse.json({ success: true, message: "Sync queued" });
}
