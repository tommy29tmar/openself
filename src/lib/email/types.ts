/**
 * Email adapter abstraction.
 * Allows swapping between Resend, SMTP, or a no-op logger
 * without changing application code.
 */

export type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  from?: string;
};

export type SendEmailResult = {
  success: boolean;
  error?: string;
};

export interface EmailAdapter {
  sendEmail(opts: SendEmailOptions): Promise<SendEmailResult>;
}
