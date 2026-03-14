import { NextResponse } from "next/server";
import { consumeAuthToken } from "@/lib/auth/tokens";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getClientIp } from "@/lib/middleware/rate-limit";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/auth/verify-email
 *
 * Consume an email verification token and mark the user as verified.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rateResult = checkAuthRateLimit(ip, "magic_link");
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts" },
      { status: 429 },
    );
  }

  try {
    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid verification link" },
        { status: 400 },
      );
    }

    const profileId = consumeAuthToken(token, "email_verification");
    if (!profileId) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired verification link" },
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

    // Mark email as verified
    db.update(users)
      .set({ emailVerified: 1, updatedAt: new Date().toISOString() })
      .where(eq(users.id, profile.userId))
      .run();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[verify-email] Error:", err);
    return NextResponse.json(
      { success: false, error: "Something went wrong" },
      { status: 500 },
    );
  }
}
