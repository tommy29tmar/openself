import { NextResponse } from "next/server";
import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getDraft, requestPublish } from "@/lib/services/page-service";
import { validateUsernameAvailability } from "@/lib/services/username-validation";

/**
 * POST /api/draft/request-publish
 *
 * Lightweight endpoint to trigger publish flow from chat quota UI.
 * Sets draft to approval_pending → SSE picks up → PublishBar appears.
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
  const authCtx = isMultiUserEnabled() ? getAuthContext(req) : null;

  // Require authentication
  if (isMultiUserEnabled() && !authCtx?.userId) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();

    // Username resolution: prefer authCtx.username, fall back to body.username (OAuth edge case)
    let resolvedUsername: string;
    if (authCtx?.username) {
      resolvedUsername = authCtx.username;
    } else {
      // OAuth edge case: username not set yet
      const bodyUsername = body?.username;
      if (!bodyUsername || typeof bodyUsername !== "string") {
        return NextResponse.json(
          { success: false, code: "USERNAME_INVALID", error: "Username is required." },
          { status: 400 },
        );
      }

      const validation = validateUsernameAvailability(bodyUsername);
      if (!validation.ok) {
        const status = validation.code === "USERNAME_TAKEN" ? 409 : 400;
        return NextResponse.json(
          { success: false, code: validation.code, error: validation.message },
          { status },
        );
      }

      resolvedUsername = bodyUsername;
    }

    // Verify draft exists
    const draft = getDraft(primaryKey);
    if (!draft) {
      return NextResponse.json(
        { success: false, code: "NO_DRAFT", error: "No draft found." },
        { status: 400 },
      );
    }

    // Set draft to approval_pending
    requestPublish(resolvedUsername, primaryKey);

    return NextResponse.json({ success: true, username: resolvedUsername });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, code: "INTERNAL", error: message },
      { status: 500 },
    );
  }
}
