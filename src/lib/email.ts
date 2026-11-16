import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Outgoing email (SRS 2.4 / 6.3: Email/SMTP service).
 *
 * Configure with:
 *   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_SECURE ("true" for port 465)
 *   EMAIL_FROM   e.g. "SEECS Events <events@seecs.edu.pk>"
 *
 * Without SMTP settings, development builds print each email to the server
 * console instead of sending it, so OTP / reset flows can still be tested.
 * Production without SMTP logs an error and reports the email as not sent.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | null = null;

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter(): Transporter {
  if (!transporter) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4000').replace(/\/+$/, '');
}

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'SEECS Events';

/** Sends an email. Never throws: email failures must not break the request that caused them. */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(
        `\n[email:dev] To: ${message.to}\n[email:dev] Subject: ${message.subject}\n${message.text}\n[email:dev] ----`,
      );
      return true;
    }
    console.error('[email] SMTP is not configured; email not sent:', message.subject);
    return false;
  }

  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html || renderHtml(message.subject, message.text),
    });
    return true;
  } catch (error) {
    console.error('[email] send failed:', (error as Error).message);
    return false;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Plain, readable HTML version of a text email (links become clickable). */
function renderHtml(subject: string, text: string): string {
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, '<br>');
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1e293b;max-width:560px;margin:auto;padding:24px">
<h2 style="font-size:18px;margin:0 0 16px">${escapeHtml(subject)}</h2><div>${body}</div>
<p style="color:#64748b;font-size:12px;margin-top:32px">${escapeHtml(APP_NAME)}</p></body></html>`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const emailTemplates = {
  verification(name: string, code: string): Omit<EmailMessage, 'to'> {
    return {
      subject: `${APP_NAME}: your verification code`,
      text:
        `Hi ${name},\n\nYour verification code is: ${code}\n\n` +
        'It expires in 15 minutes. If you did not create an account, you can ignore this email.',
    };
  },

  passwordReset(name: string, link: string): Omit<EmailMessage, 'to'> {
    return {
      subject: `${APP_NAME}: reset your password`,
      text:
        `Hi ${name},\n\nUse this link to set a new password (valid for 30 minutes):\n${link}\n\n` +
        'If you did not ask for this, you can ignore this email; your password stays the same.',
    };
  },

  /** Generic notification email that mirrors an in-app notification. */
  notification(name: string, title: string, body: string, link?: string | null): Omit<EmailMessage, 'to'> {
    const url = link ? (link.startsWith('http') ? link : `${appBaseUrl()}${link}`) : null;
    return {
      subject: `${APP_NAME}: ${title}`,
      text: `Hi ${name},\n\n${body}${url ? `\n\nOpen: ${url}` : ''}`,
    };
  },
};
