import { NextResponse } from "next/server";
import { getActiveMemoriesScored } from "@/lib/services/memory-service";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";

/**
 * GET /api/memory
 * Returns scored active memories for the current owner.
 */
export async function GET(request: Request) {
  const scope = resolveOwnerScope(request);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";

  const memories = getActiveMemoriesScored(ownerKey, 50);
  return NextResponse.json({ memories });
}
