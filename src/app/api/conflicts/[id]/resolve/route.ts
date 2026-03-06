import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { resolveConflict, type ConflictResolution } from "@/lib/services/conflict-service";

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
  let body: { resolution?: string; mergedValue?: Record<string, unknown> };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }

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

  try {
    const result = resolveConflict(conflictId, ownerKey, resolution as ConflictResolution, mergedValue);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.error === "Conflict not found or already resolved" ? 404 : 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[conflicts.resolve] unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
