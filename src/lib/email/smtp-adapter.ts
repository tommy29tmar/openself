import type { EmailAdapter, SendEmailOptions, SendEmailResult } from "./types";

const DEFAULT_FROM = "OpenSelf <noreply@openself.dev>";

/**
 * SMTP email adapter using nodemailer.
 * Requires EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER, EMAIL_SMTP_PASS env vars.
 */
export class SmtpAdapter implements EmailAdapter {
  private host: string;
  private port: number;
  private user: string;
  private pass: string;

  constructor(opts: { host: string; port: number; user: string; pass: string }) {
    this.host = opts.host;
    this.port = opts.port;
    this.user = opts.user;
    this.pass = opts.pass;
  }

  async sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
    try {
      // Dynamic import to avoid bundling nodemailer when not used
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.port === 465,
        auth: {
          user: this.user,
          pass: this.pass,
        },
      });

      await transporter.sendMail({
        from: opts.from ?? DEFAULT_FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      });

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[email:smtp] Send error:", message);
      return { success: false, error: message };
    }
  }
}
