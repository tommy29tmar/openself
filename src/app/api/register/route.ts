import { NextResponse } from "next/server";
import { getSessionIdFromRequest, getAuthContext, createSessionCookie } from "@/lib/auth/session";
import {
  isMultiUserEnabled,
  getSession,
  isUsernameTaken,
  registerUsername,
} from "@/lib/services/session-service";
import { prepareAndPublish, PublishError } from "@/lib/services/publish-pipeline";
import { logEvent } from "@/lib/services/event-service";
import { AUTH_V2 } from "@/lib/flags";
import {
  createUser,
  isEmailTaken,
  linkProfileToUser,
  setProfileUsername,
  createAuthSession,
} from "@/lib/services/auth-service";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { sqlite } from "@/lib/db";

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;
const RESERVED = new Set(["draft", "api", "builder", "admin", "invite", "_next", "login", "signup"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  // Rate limit: 3 attempts / 60s per IP for registration
  const rateResult = checkRateLimit(req, { maxRequests: 3, windowMs: 60_000, skipPace: true });
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rateResult.retryAfter ?? 60) } },
    );
  }

  const sessionId = getSessionIdFromRequest(req);

  if (isMultiUserEnabled()) {
    if (!sessionId || !getSession(sessionId)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
  }

  try {
    const body = await req.json();
    const username = body?.username;

    if (!username || typeof username !== "string") {
      return NextResponse.json(
        { success: false, error: "username is required", code: "USERNAME_INVALID" },
        { status: 400 },
      );
    }

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { success: false, error: "Invalid username. Use lowercase letters, numbers, and hyphens (1-39 chars).", code: "USERNAME_INVALID" },
        { status: 400 },
      );
    }

    if (RESERVED.has(username)) {
      return NextResponse.json(
        { success: false, error: `"${username}" is reserved`, code: "USERNAME_RESERVED" },
        { status: 400 },
      );
    }

    if (isUsernameTaken(username)) {
      return NextResponse.json(
        { success: false, error: "Username already taken", code: "USERNAME_TAKEN" },
        { status: 409 },
      );
    }

    const authCtx = getAuthContext(req);
    const profileId = authCtx?.profileId ?? sessionId;

    if (AUTH_V2) {
      // -- AUTH_V2: require email + password --
      const email = body?.email;
      const password = body?.password;

      if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
        return NextResponse.json(
          { success: false, error: "Valid email is required", code: "USERNAME_INVALID" },
          { status: 400 },
        );
      }

      if (!password || typeof password !== "string" || password.length < 8) {
        return NextResponse.json(
          { success: false, error: "Password must be at least 8 characters", code: "USERNAME_INVALID" },
          { status: 400 },
        );
      }

      if (isEmailTaken(email)) {
        return NextResponse.json(
          { success: false, error: "Email already registered", code: "EMAIL_TAKEN" },
          { status: 409 },
        );
      }

      // Atomic: create user + link profile + register username
      const user = await createUser(email, password);

      const txnLink = sqlite.transaction(() => {
        linkProfileToUser(profileId, user.id);
        setProfileUsername(profileId, username);
        registerUsername(sessionId, username);
      });
      txnLink();

      // Publish via shared pipeline
      const result = await prepareAndPublish(username, sessionId, { mode: "register" });

      // Session rotation: new session linked to user + profile
      const newSessionId = createAuthSession(user.id, profileId);

      logEvent({
        eventType: "user_registered",
        actor: "user",
        payload: { username, sessionId, email: email.toLowerCase(), regenerated: result.regenerated },
      });

      const response = NextResponse.json({
        success: true,
        username,
        url: result.url,
      });

      response.headers.set("Set-Cookie", createSessionCookie(newSessionId));

      return response;
    } else {
      // -- Legacy mode: username only --
      registerUsername(sessionId, username);

      const result = await prepareAndPublish(username, sessionId, { mode: "register" });

      logEvent({
        eventType: "user_registered",
        actor: "user",
        payload: { username, sessionId, regenerated: result.regenerated },
      });

      return NextResponse.json({
        success: true,
        username,
        url: result.url,
      });
    }
  } catch (error) {
    if (error instanceof PublishError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
