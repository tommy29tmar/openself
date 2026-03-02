import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getConnectorStatus } from "@/lib/connectors/connector-service";
import { connectorError } from "@/lib/connectors/api-errors";

export async function GET(req: Request) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return connectorError("AUTH_REQUIRED", "Authentication required.", 403, false);
  }

  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";

  try {
    const connectors = getConnectorStatus(ownerKey);
    return NextResponse.json({ success: true, connectors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return connectorError("INTERNAL", message, 500, true);
  }
}
