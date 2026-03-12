import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getActivityFeed } from "@/lib/services/activity-feed-service";

export async function GET(req: Request) {
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "30", 10);

  const items = getActivityFeed(ownerKey, { limit });
  return NextResponse.json({ success: true, items });
}
