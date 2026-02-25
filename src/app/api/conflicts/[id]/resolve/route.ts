import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { resolveConflict } from "@/lib/services/conflict-service";

/**
 * POST /api/conflicts/:id/resolve
 * Body: { resolution: "keep_a"|"keep_b"|"merge"|"dismissed", mergedValue?: object }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";
  const { id: conflictId } = await params;

  try {
    const body = await req.json();
    const { resolution, mergedValue } = body;

    const validResolutions = ["keep_a", "keep_b", "merge", "dismissed"];
    if (!resolution || !validResolutions.includes(resolution)) {
      return NextResponse.json(
        { success: false, error: `resolution must be one of: ${validResolutions.join(", ")}` },
        { status: 400 },
      );
    }

    if (resolution === "merge" && !mergedValue) {
      return NextResponse.json(
        { success: false, error: "mergedValue is required for merge resolution" },
        { status: 400 },
      );
    }

    const result = resolveConflict(conflictId, ownerKey, resolution, mergedValue);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }
}
