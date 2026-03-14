import { NextResponse } from "next/server";
import { getUserByEmail, getProfileForUser } from "@/lib/services/auth-service";
import { createAuthToken } from "@/lib/auth/tokens";
import { getEmailAdapter } from "@/lib/email";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { getClientIp } from "@/lib/middleware/rate-limit";

/**
 * POST /api/auth/magic-link
 *
 * Send a magic login link. Always returns 200 (timing-safe).
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rateResult = checkAuthRateLimit(ip, "magic_link");
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
      return NextResponse.json({ success: true });
    }

    const user = getUserByEmail(email);
    if (user) {
      const profile = getProfileForUser(user.id);
      if (profile) {
        const token = createAuthToken(profile.id, "magic_link");
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
        const loginUrl = `${baseUrl}/api/auth/magic-link/callback?token=${token}`;

        const adapter = getEmailAdapter();
        await adapter.sendEmail({
          to: user.email,
          subject: "Sign in to OpenSelf",
          html: buildMagicLinkEmail(loginUrl),
        });
      }
    }

    // Always return success — timing-safe
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[magic-link] Error:", err);
    return NextResponse.json({ success: true });
  }
}

function buildMagicLinkEmail(loginUrl: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">Sign in to OpenSelf</h2>
      <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
        Click the button below to sign in. This link expires in 1 hour and can only be used once.
      </p>
      <a href="${loginUrl}"
         style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
        Sign in
      </a>
      <p style="color: #999; font-size: 13px; margin-top: 24px;">
        If you did not request this, you can safely ignore this email.
      </p>
    </div>
  `;
}

