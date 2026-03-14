import { NextResponse } from "next/server";
import { consumeAuthToken, validateAuthToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/services/auth-service";
import { db } from "@/lib/db";
import { users, profiles, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getClientIp } from "@/lib/middleware/rate-limit";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/auth/reset-password
 *
 * Consume token and set a new password.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rateResult = checkAuthRateLimit(ip, "password_reset");
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts" },
      { status: 429 },
    );
  }

  try {
    const body = await req.json();
    const { token, password } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid or expired link" },
        { status: 400 },
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    // Validate the token (read-only) before consuming
    const profileId = validateAuthToken(token, "password_reset");
    if (!profileId) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired link" },
        { status: 400 },
      );
    }

    // Find the user for this profile (before consuming token)
    const profile = db
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .get();

    if (!profile?.userId) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 400 },
      );
    }

    // Now consume the token (one-time use)
    const consumed = consumeAuthToken(token, "password_reset");
    if (!consumed) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired link" },
        { status: 400 },
      );
    }

    // Hash the new password and update
    const passwordHash = await hashPassword(password);
    db.update(users)
      .set({ passwordHash, updatedAt: new Date().toISOString() })
      .where(eq(users.id, profile.userId))
      .run();

    // Invalidate all sessions for this profile (force re-auth on all devices)
    db.delete(sessions)
      .where(eq(sessions.profileId, profileId))
      .run();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[reset-password] Error:", err);
    return NextResponse.json(
      { success: false, error: "Something went wrong" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/auth/reset-password?token=...
 *
 * Validate a token without consuming it (for UI rendering).
 */
export async function GET(req: Request) {
  const ip = getClientIp(req);
  const rateResult = checkAuthRateLimit(ip, "password_reset");
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts" },
      { status: 429 },
    );
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ valid: false });
  }

  const profileId = validateAuthToken(token, "password_reset");
  return NextResponse.json({ valid: !!profileId });
}
