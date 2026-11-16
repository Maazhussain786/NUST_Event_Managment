/**
 * Which email addresses may create accounts (FR-AUTH-04, SRS 2.5).
 *
 * The platform currently serves SEECS only. To widen it later (e.g. all of NUST),
 * set ALLOWED_EMAIL_DOMAINS="seecs.edu.pk,nust.edu.pk" — no code change needed.
 * Super admins are provisioned directly and are not subject to this rule.
 */
const DEFAULT_DOMAINS = ['seecs.edu.pk'];

export function allowedEmailDomains(): string[] {
  const configured = (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_DOMAINS;
}

export const NUST_ONLY_ERROR_MESSAGE = `Only SEECS accounts (${allowedEmailDomains()
  .map((d) => `@${d}`)
  .join(', ')}) can sign up.`;

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

/** True when the address belongs to an allowed domain (sub-domains are not accepted). */
export function isAllowedNustEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  const domain = normalized.split('@')[1] || '';
  return isValidEmailFormat(normalized) && allowedEmailDomains().includes(domain);
}

export function isNustStudentEmailForSignup(email: string): boolean {
  return isAllowedNustEmail(email);
}

/** Minimum password rule shared by sign-up and password reset. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (password.length > 128) return 'Password must be at most 128 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}
