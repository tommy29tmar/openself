import { NextResponse } from "next/server";
import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getDraft, getPublishedPage, getPublishedUsername, upsertDraft } from "@/lib/services/page-service";

/**
 * POST /api/draft/discard
 *
 * Replaces the draft config with the currently published config,
 * effectively discarding all unpublished changes.
 * Requires authentication.
 */
export async function POST(req: Request) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  const primaryKey = scope?.knowledgePrimaryKey ?? "__default__";
  const readKeys = scope?.knowledgeReadKeys ?? ["__default__"];
  const authCtx = isMultiUserEnabled() ? getAuthContext(req) : null;

  // Require authentication
  if (isMultiUserEnabled() && !authCtx?.userId) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  try {
    // Verify draft exists
    const draft = getDraft(primaryKey);
    if (!draft) {
      return NextResponse.json(
        { success: false, code: "NO_DRAFT", error: "No draft found." },
        { status: 400 },
      );
    }

    // Find published page
    const publishedUsername = getPublishedUsername(readKeys);
    if (!publishedUsername) {
      return NextResponse.json(
        { success: false, code: "NO_PUBLISHED", error: "No published page to revert to." },
        { status: 400 },
      );
    }

    const publishedConfig = getPublishedPage(publishedUsername);
    if (!publishedConfig) {
      return NextResponse.json(
        { success: false, code: "NO_PUBLISHED", error: "No published page to revert to." },
        { status: 400 },
      );
    }

    // Overwrite draft with published config
    const profileId = authCtx?.profileId ?? primaryKey;
    upsertDraft(publishedUsername, publishedConfig, primaryKey, profileId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, code: "INTERNAL", error: message },
      { status: 500 },
    );
  }
}
