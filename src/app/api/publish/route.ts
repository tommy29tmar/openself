import { NextResponse } from "next/server";
import { prepareAndPublish, PublishError } from "@/lib/services/publish-pipeline";
import { logEvent } from "@/lib/services/event-service";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";

/**
 * POST /api/publish
 *
 * Server-side publish gate: only an explicit user action can publish a page.
 * The agent can only request_publish (mark draft as approval_pending).
 * This endpoint promotes draft → published via the shared pipeline.
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

  try {
    const body = await req.json();
    const username = body?.username;
    const expectedHash = body?.expectedHash;

    if (!username || typeof username !== "string") {
      return NextResponse.json(
        { success: false, error: "username is required" },
        { status: 400 },
      );
    }

    // Validate: alphanumeric + hyphens, 1-39 chars
    if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(username)) {
      return NextResponse.json(
        { success: false, error: "Invalid username. Use lowercase letters, numbers, and hyphens.", code: "USERNAME_INVALID" },
        { status: 400 },
      );
    }

    const result = await prepareAndPublish(username, primaryKey, {
      mode: "publish",
      expectedHash: typeof expectedHash === "string" ? expectedHash : undefined,
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
