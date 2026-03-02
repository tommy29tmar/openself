import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { disconnectConnector, getConnectorById } from "@/lib/connectors/connector-service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";

  try {
    // Verify connector exists and belongs to this owner
    const connector = getConnectorById(id);
    if (!connector) {
      return NextResponse.json(
        { success: false, code: "NOT_FOUND", error: "Connector not found." },
        { status: 404 },
      );
    }
    if (connector.ownerKey !== ownerKey) {
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: "Connector does not belong to this user." },
        { status: 403 },
      );
    }

    disconnectConnector(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, code: "INTERNAL", error: message },
      { status: 500 },
    );
  }
}
