import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { markFeedViewed } from "@/lib/services/activity-feed-service";

export async function POST(req: Request) {
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";

  markFeedViewed(ownerKey);
  return NextResponse.json({ success: true });
}
