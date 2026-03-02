import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { disconnectConnector, getConnectorById } from "@/lib/connectors/connector-service";
import { connectorError } from "@/lib/connectors/api-errors";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return connectorError("AUTH_REQUIRED", "Authentication required.", 403, false);
  }

  const { id } = await params;
  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";

  try {
    // Verify connector exists and belongs to this owner
    const connector = getConnectorById(id);
    if (!connector) {
      return connectorError("NOT_FOUND", "Connector not found.", 404, false);
    }
    if (connector.ownerKey !== ownerKey) {
      return connectorError("FORBIDDEN", "Connector does not belong to this user.", 403, false);
    }

    disconnectConnector(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return connectorError("INTERNAL", message, 500, true);
  }
}
