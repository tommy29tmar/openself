import { NextResponse } from "next/server";
import { createSessionCookie } from "@/lib/auth/session";
import { isUsernameTaken } from "@/lib/services/session-service";
import { logEvent } from "@/lib/services/event-service";
import {
  createUser,
  isEmailTaken,
  createProfile,
  setProfileUsername,
  createAuthSession,
} from "@/lib/services/auth-service";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;
const RESERVED = new Set(["draft", "api", "builder", "admin", "invite", "_next", "login", "signup"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/signup
 *
 * Standalone account creation (no prior session required).
 * Creates user + profile + session, then redirects to /builder.
 */
export async function POST(req: Request) {
  const rateResult = checkRateLimit(req, { maxRequests: 3, windowMs: 60_000, skipPace: true });
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rateResult.retryAfter ?? 60) } },
    );
  }

  try {
    const body = await req.json();
    const username = body?.username;
    const email = body?.email;
    const password = body?.password;

    // Validate username
    if (!username || typeof username !== "string") {
      return NextResponse.json(
        { success: false, error: "Username is required", code: "USERNAME_INVALID" },
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

    // Validate email
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, error: "Valid email is required", code: "USERNAME_INVALID" },
        { status: 400 },
      );
    }

    if (isEmailTaken(email)) {
      return NextResponse.json(
        { success: false, error: "Email already registered", code: "EMAIL_TAKEN" },
        { status: 409 },
      );
    }

    // Validate password
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 8 characters", code: "USERNAME_INVALID" },
        { status: 400 },
      );
    }

    // Create user + profile
    const user = await createUser(email, password);
    const profile = createProfile(user.id);
    setProfileUsername(profile.id, username);

    // Create session
    const sessionId = createAuthSession(user.id, profile.id);

    logEvent({
      eventType: "user_registered",
      actor: "user",
      payload: { username, email: email.toLowerCase() },
    });

    const response = NextResponse.json({ success: true, username });
    response.headers.set("Set-Cookie", createSessionCookie(sessionId));

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[signup] Error:", message);
    return NextResponse.json(
      { success: false, error: "Signup failed" },
      { status: 500 },
    );
  }
}
