import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getUserById } from "@/lib/services/auth-service";
import { sendVerificationEmail } from "@/lib/auth/verification";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/auth/resend-verification
 *
 * Resend the email verification link for the current user.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rateResult = checkAuthRateLimit(ip, "magic_link"); // shares magic_link budget
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  try {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    const user = getUserById(auth.userId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    if (user.emailVerified === 1) {
      return NextResponse.json({ success: true, message: "Already verified" });
    }

    await sendVerificationEmail(auth.profileId, user.email);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[resend-verification] Error:", err);
    return NextResponse.json(
      { success: false, error: "Something went wrong" },
      { status: 500 },
    );
  }
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
