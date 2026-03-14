import { createAuthToken } from "@/lib/auth/tokens";
import { getEmailAdapter } from "@/lib/email";

/**
 * Send a verification email to a new user.
 * Non-blocking: logs errors but does not throw.
 */
export async function sendVerificationEmail(
  profileId: string,
  email: string,
): Promise<void> {
  try {
    const token = createAuthToken(profileId, "email_verification");
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

    const adapter = getEmailAdapter();
    const result = await adapter.sendEmail({
      to: email,
      subject: "Verify your OpenSelf email",
      html: buildVerificationEmail(verifyUrl),
    });

    if (!result.success) {
      console.error("[verification] Failed to send email:", result.error);
    }
  } catch (err) {
    console.error("[verification] Error sending verification email:", err);
  }
}

function buildVerificationEmail(verifyUrl: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">Verify your email</h2>
      <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
        Welcome to OpenSelf! Click the button below to verify your email address.
        This link expires in 1 hour.
      </p>
      <a href="${verifyUrl}"
         style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
        Verify email
      </a>
      <p style="color: #999; font-size: 13px; margin-top: 24px;">
        If you did not create an account, you can safely ignore this email.
      </p>
    </div>
  `;
}
