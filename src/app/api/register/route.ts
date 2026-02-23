import { NextResponse } from "next/server";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import {
  isMultiUserEnabled,
  getSession,
  isUsernameTaken,
  registerUsername,
} from "@/lib/services/session-service";
import { confirmPublish, getDraft, requestPublish } from "@/lib/services/page-service";
import { logEvent } from "@/lib/services/event-service";

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;
const RESERVED = new Set(["draft", "api", "builder", "admin", "invite", "_next"]);

export async function POST(req: Request) {
  const sessionId = getSessionIdFromRequest(req);

  if (isMultiUserEnabled()) {
    if (!sessionId || !getSession(sessionId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = await req.json();
    const username = body?.username;

    if (!username || typeof username !== "string") {
      return NextResponse.json(
        { success: false, error: "username is required" },
        { status: 400 },
      );
    }

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { success: false, error: "Invalid username. Use lowercase letters, numbers, and hyphens (1-39 chars)." },
        { status: 400 },
      );
    }

    if (RESERVED.has(username)) {
      return NextResponse.json(
        { success: false, error: `"${username}" is reserved` },
        { status: 400 },
      );
    }

    if (isUsernameTaken(username)) {
      return NextResponse.json(
        { success: false, error: "Username already taken" },
        { status: 409 },
      );
    }

    // Register the username on the session
    registerUsername(sessionId, username);

    // Auto-publish: set draft to approval_pending then confirm
    const draft = getDraft(sessionId);
    if (draft) {
      if (draft.status !== "approval_pending") {
        requestPublish(username, sessionId);
      }
      confirmPublish(username, sessionId);
    }

    logEvent({
      eventType: "user_registered",
      actor: "user",
      payload: { username, sessionId },
    });

    return NextResponse.json({
      success: true,
      username,
      url: `/${username}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
