import { NextResponse } from "next/server";
import { prepareAndPublish, PublishError } from "@/lib/services/publish-pipeline";
import { logEvent } from "@/lib/services/event-service";
import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getUserById } from "@/lib/services/auth-service";

/**
 * POST /api/publish
 *
 * Server-side publish gate: only an explicit user action can publish a page.
 * The agent can only request_publish (mark draft as approval_pending).
 * This endpoint promotes draft → published via the shared pipeline.
 *
 * In multi-user mode:
 * - Anonymous users are blocked (403 AUTH_REQUIRED) — they must sign up first.
 * - Authenticated users with an existing username: body.username is ignored,
 *   authCtx.username is used (prevents publishing under a different username).
 * - Authenticated users without a username (OAuth edge case): body.username is
 *   used and claimed atomically via claimProfileId in the pipeline transaction.
 *
 * Accepts optional `expectedHash` in body for concurrency guard.
 */
export async function POST(req: Request) {
  // Resolve owner scope (survives session rotation)
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const primaryKey = scope?.knowledgePrimaryKey ?? "__default__";

  // Auth gate: block anonymous publish in multi-user mode
  const authCtx = isMultiUserEnabled() ? getAuthContext(req) : null;
  if (isMultiUserEnabled() && !authCtx?.userId) {
    return NextResponse.json(
      { success: false, error: "Sign up required to publish", code: "AUTH_REQUIRED" },
      { status: 403 },
    );
  }

  // Email verification gate: block publish for unverified users
  if (authCtx?.userId) {
    const user = getUserById(authCtx.userId);
    if (user && user.emailVerified !== 1) {
      return NextResponse.json(
        { success: false, error: "Verify your email to publish", code: "EMAIL_NOT_VERIFIED" },
        { status: 403 },
      );
    }
  }

  // Effective username: if user already has one, enforce it (ignore body)
  const effectiveUsername = authCtx?.username ?? null;

  try {
    const body = await req.json();
    const expectedHash = body?.expectedHash;

    // Use effective username if set, otherwise fall back to body
    const username = effectiveUsername ?? body?.username;

    if (!username || typeof username !== "string") {
      return NextResponse.json(
        { success: false, error: "username is required" },
        { status: 400 },
      );
    }

    if (effectiveUsername) {
      // Existing usernames are already owned by this profile; keep only the
      // historical format guard here.
      if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(username)) {
        return NextResponse.json(
          { success: false, error: "Invalid username. Use lowercase letters, numbers, and hyphens.", code: "USERNAME_INVALID" },
          { status: 400 },
        );
      }
    } else {
      const { validateUsernameAvailability } = await import("@/lib/services/username-validation");
      const validation = validateUsernameAvailability(username);
      if (!validation.ok) {
        const status = validation.code === "USERNAME_TAKEN" ? 409 : 400;
        return NextResponse.json(
          { success: false, error: validation.message, code: validation.code },
          { status },
        );
      }
    }

    // If authenticated user has no username yet, claim it atomically with publish
    const claimProfileId = (isMultiUserEnabled() && !effectiveUsername && authCtx)
      ? authCtx.profileId
      : undefined;

    const result = await prepareAndPublish(username, primaryKey, {
      mode: "publish",
      expectedHash: typeof expectedHash === "string" ? expectedHash : undefined,
      claimProfileId,
      ownerKey: scope?.cognitiveOwnerKey,
      readKeys: scope?.knowledgeReadKeys,
    });

    logEvent({
      eventType: "page_published",
      actor: "user",
      payload: { username },
    });

    return NextResponse.json({
      success: true,
      url: result.url,
    });
  } catch (error) {
    if (error instanceof PublishError) {
      logEvent({
        eventType: "publish_failed",
        actor: "user",
        payload: { error: error.message, code: error.code },
      });
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    logEvent({
      eventType: "publish_failed",
      actor: "user",
      payload: { error: message },
    });
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
