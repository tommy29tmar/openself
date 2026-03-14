import type { EmailAdapter, SendEmailOptions, SendEmailResult } from "./types";
import { ResendAdapter } from "./resend-adapter";
import { SmtpAdapter } from "./smtp-adapter";

export type { EmailAdapter, SendEmailOptions, SendEmailResult } from "./types";

/**
 * No-op email adapter: logs to console, returns success.
 * Used when no email service is configured.
 */
class NoopAdapter implements EmailAdapter {
  async sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
    console.info(
      `[email:noop] Would send email to=${opts.to} subject="${opts.subject}" (no email service configured)`,
    );
    return { success: true };
  }
}

let _adapter: EmailAdapter | null = null;

/**
 * Get the configured email adapter. Singleton — resolved once, cached.
 *
 * Priority:
 * 1. RESEND_API_KEY → ResendAdapter
 * 2. EMAIL_SMTP_HOST → SmtpAdapter
 * 3. NoopAdapter (logs to console)
 */
export function getEmailAdapter(): EmailAdapter {
  if (_adapter) return _adapter;

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    _adapter = new ResendAdapter(resendKey);
    console.info("[email] Using Resend adapter");
    return _adapter;
  }

  const smtpHost = process.env.EMAIL_SMTP_HOST;
  if (smtpHost) {
    _adapter = new SmtpAdapter({
      host: smtpHost,
      port: parseInt(process.env.EMAIL_SMTP_PORT ?? "587", 10),
      user: process.env.EMAIL_SMTP_USER ?? "",
      pass: process.env.EMAIL_SMTP_PASS ?? "",
    });
    console.info("[email] Using SMTP adapter");
    return _adapter;
  }

  _adapter = new NoopAdapter();
  console.info("[email] No email service configured — using noop adapter");
  return _adapter;
}

/**
 * Reset the cached adapter. For testing only.
 */
export function _resetEmailAdapter(): void {
  _adapter = null;
}
