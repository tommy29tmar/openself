import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getTrustLedger, reverseTrustAction } from "@/lib/services/trust-ledger-service";

/**
 * GET /api/trust-ledger — List recent trust entries
 * POST /api/trust-ledger — Reverse a trust action
 * Body: { entryId: string }
 */
export async function GET(req: Request) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";
  const entries = getTrustLedger(ownerKey);

  return NextResponse.json({ success: true, entries });
}

export async function POST(req: Request) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";

  try {
    const body = await req.json();
    const { entryId } = body;

    if (!entryId || typeof entryId !== "string") {
      return NextResponse.json(
        { success: false, error: "entryId is required" },
        { status: 400 },
      );
    }

    const reversed = reverseTrustAction(entryId, ownerKey);

    if (!reversed) {
      return NextResponse.json(
        { success: false, error: "Entry not found, already reversed, or not reversible" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
