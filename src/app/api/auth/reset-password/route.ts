import { NextResponse } from "next/server";
import { consumeAuthToken, validateAuthToken } from "@/lib/auth/tokens";
import { hashPassword, getUserById } from "@/lib/services/auth-service";
import { db } from "@/lib/db";
import { users, profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/auth/reset-password
 *
 * Consume token and set a new password.
 */
export async function POST(req: Request) {
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

    // Consume the token (one-time use)
    const profileId = consumeAuthToken(token, "password_reset");
    if (!profileId) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired link" },
        { status: 400 },
      );
    }

    // Find the user for this profile
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

    // Hash the new password and update
    const passwordHash = await hashPassword(password);
    db.update(users)
      .set({ passwordHash, updatedAt: new Date().toISOString() })
      .where(eq(users.id, profile.userId))
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
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ valid: false });
  }

  const profileId = validateAuthToken(token, "password_reset");
  return NextResponse.json({ valid: !!profileId });
}
