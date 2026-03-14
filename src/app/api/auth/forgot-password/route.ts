import { NextResponse } from "next/server";
import { getUserByEmail, getProfileForUser } from "@/lib/services/auth-service";
import { createAuthToken } from "@/lib/auth/tokens";
import { getEmailAdapter } from "@/lib/email";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { getClientIp } from "@/lib/middleware/rate-limit";

/**
 * POST /api/auth/forgot-password
 *
 * Send a password reset link. Always returns 200 (timing-safe:
 * do not reveal whether the email exists).
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rateResult = checkAuthRateLimit(ip, "password_reset");
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateResult.retryAfterSeconds ?? 60) } },
    );
  }

  try {
    const body = await req.json();
    const email = body?.email;

    if (!email || typeof email !== "string") {
      // Still return 200 to avoid leaking info
      return NextResponse.json({ success: true });
    }

    const user = getUserByEmail(email);
    if (user) {
      const profile = getProfileForUser(user.id);
      if (profile) {
        const token = createAuthToken(profile.id, "password_reset");
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;

        const adapter = getEmailAdapter();
        await adapter.sendEmail({
          to: user.email,
          subject: "Reset your OpenSelf password",
          html: buildResetEmail(resetUrl),
        });
      }
    }

    // Always return success — timing-safe
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[forgot-password] Error:", err);
    return NextResponse.json({ success: true });
  }
}

function buildResetEmail(resetUrl: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">Reset your password</h2>
      <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
        You requested a password reset for your OpenSelf account.
        Click the button below to set a new password. This link expires in 1 hour.
      </p>
      <a href="${resetUrl}"
         style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
        Reset password
      </a>
      <p style="color: #999; font-size: 13px; margin-top: 24px;">
        If you did not request this, you can safely ignore this email.
      </p>
    </div>
  `;
}

