import { NextResponse } from "next/server";
import { getConnectorStatus } from "@/lib/connectors/connector-service";
import { connectorError } from "@/lib/connectors/api-errors";
import { resolveAuthenticatedConnectorScope } from "@/lib/connectors/route-auth";

export async function GET(req: Request) {
  const scope = resolveAuthenticatedConnectorScope(req);
  if (!scope) {
    return connectorError("AUTH_REQUIRED", "Authentication required.", 403, false);
  }

  const ownerKey = scope.cognitiveOwnerKey;

  try {
    const connectors = getConnectorStatus(ownerKey);
    return NextResponse.json({ success: true, connectors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return connectorError("INTERNAL", message, 500, true);
  }
}
