import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { disconnectConnector } from "@/lib/connectors/connector-service";

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

  try {
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
