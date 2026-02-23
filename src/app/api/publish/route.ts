import { NextResponse } from "next/server";
import { confirmPublish } from "@/lib/services/page-service";
import { logEvent } from "@/lib/services/event-service";

/**
 * POST /api/publish
 *
 * Server-side publish gate: only an explicit user action can publish a page.
 * The agent can only request_publish (mark draft as approval_pending).
 * This endpoint promotes draft → published.
 *
 * SECURITY NOTE: This endpoint has no auth or CSRF protection.
 * Acceptable only in trusted local environment (dogfooding Phase 0).
 * Before exposing online, add auth + CSRF token.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = body?.username;

    if (!username || typeof username !== "string") {
      return NextResponse.json(
        { success: false, error: "username is required" },
        { status: 400 },
      );
    }

    // Validate: alphanumeric + hyphens, 1-39 chars
    if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(username)) {
      return NextResponse.json(
        { success: false, error: "Invalid username. Use lowercase letters, numbers, and hyphens." },
        { status: 400 },
      );
    }

    confirmPublish(username);

    logEvent({
      eventType: "page_published",
      actor: "user",
      payload: { username },
    });

    return NextResponse.json({
      success: true,
      url: `/${username}`,
    });
  } catch (error) {
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
