import type { EmailAdapter, SendEmailOptions, SendEmailResult } from "./types";

const DEFAULT_FROM = "OpenSelf <noreply@openself.dev>";

/**
 * Email adapter using Resend (https://resend.com).
 * Requires RESEND_API_KEY env var.
 */
export class ResendAdapter implements EmailAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: opts.from ?? DEFAULT_FROM,
          to: [opts.to],
          subject: opts.subject,
          html: opts.html,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error("[email:resend] Send failed:", res.status, body);
        return { success: false, error: `Resend API error: ${res.status}` };
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[email:resend] Send error:", message);
      return { success: false, error: message };
    }
  }
}
