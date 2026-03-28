export const NUST_ONLY_ERROR_MESSAGE =
  'Only NUST student accounts are allowed to access this platform.';

const ALLOWED_NUST_DOMAINS = ['seecs.edu.pk', 'nust.edu.pk'] as const;

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function isAllowedNustEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return ALLOWED_NUST_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}

export function isNustStudentEmailForSignup(email: string): boolean {
  return isAllowedNustEmail(email);
}

