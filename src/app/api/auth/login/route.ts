import { NextResponse } from "next/server";
import {
  getUserByEmail,
  verifyPassword,
  getProfileForUser,
  createAuthSession,
} from "@/lib/services/auth-service";
import { createSessionCookie, getSessionIdFromRequest } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { sqlite } from "@/lib/db";

/**
 * POST /api/auth/login
 *
 * Authenticate with email + password.
 * Creates a new session (anti session-fixation).
 */
export async function POST(req: Request) {
  // Rate limit: 5 attempts / 60s per IP
  const rateResult = checkRateLimit(req, { maxRequests: 5, windowMs: 60_000 });
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rateResult.retryAfter ?? 60) } },
    );
  }

  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid credentials", code: "INVALID_CREDENTIALS" },
        { status: 401 },
      );
    }

    // Lookup user (generic error for both email-not-found and wrong-password)
    const user = getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials", code: "INVALID_CREDENTIALS" },
        { status: 401 },
      );
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials", code: "INVALID_CREDENTIALS" },
        { status: 401 },
      );
    }

    // Get profile
    const profile = getProfileForUser(user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials", code: "INVALID_CREDENTIALS" },
        { status: 401 },
      );
    }

    // Backfill existing session's profileId (if user had an invite session before logging in)
    const existingSessionId = getSessionIdFromRequest(req);
    if (existingSessionId) {
      const linkResult = sqlite
        .prepare(
          "UPDATE sessions SET profile_id = ? WHERE id = ? AND profile_id IS NULL",
        )
        .run(profile.id, existingSessionId);

      // Backfill fact profileId so anonymous facts become visible under the profile
      if (linkResult.changes === 1) {
        try {
          const { backfillProfileId } = await import("@/lib/services/kb-service");
          const backfilled = backfillProfileId([existingSessionId], profile.id);
          if (backfilled > 0) {
            console.info("[login] Backfilled profileId on", backfilled, "facts for session", existingSessionId);
          }
        } catch (err) {
          console.warn("[login] Fact profileId backfill failed (non-fatal):", err);
        }
      }
    }

    // Create new session (session rotation for anti-fixation)
    const sessionId = createAuthSession(user.id, profile.id);

    const response = NextResponse.json({
      success: true,
      username: profile.username,
    });

    response.headers.set("Set-Cookie", createSessionCookie(sessionId));

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid credentials", code: "INVALID_CREDENTIALS" },
      { status: 401 },
    );
  }
}
