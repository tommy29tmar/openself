import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getDraft, getPublishedPage, getPublishedUsername } from "@/lib/services/page-service";
import { computePageDiff } from "@/lib/services/page-diff-service";

/**
 * GET /api/draft/diff
 *
 * Returns a section-level diff between the current draft and published page.
 * Used by the UnpublishedBanner to show what has changed.
 */
export async function GET(req: Request) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED" },
      { status: 403 },
    );
  }

  const primaryKey = scope?.knowledgePrimaryKey ?? "__default__";
  const readKeys = scope?.knowledgeReadKeys ?? ["__default__"];

  try {
    const draft = getDraft(primaryKey);
    if (!draft) {
      return NextResponse.json({ success: true, changes: [] });
    }

    const publishedUsername = getPublishedUsername(readKeys);
    if (!publishedUsername) {
      return NextResponse.json({ success: true, changes: [] });
    }

    const publishedConfig = getPublishedPage(publishedUsername);
    if (!publishedConfig) {
      return NextResponse.json({ success: true, changes: [] });
    }

    const changes = computePageDiff(draft.config, publishedConfig);
    return NextResponse.json({ success: true, changes });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, code: "INTERNAL", error: message },
      { status: 500 },
    );
  }
}
