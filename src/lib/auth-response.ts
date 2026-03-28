import type { NextRequest } from 'next/server';

export function shouldReturnAuthToken(req: NextRequest): boolean {
  const platform = (req.headers.get('x-client-platform') || '').trim().toLowerCase();
  const includeToken = req.nextUrl.searchParams.get('includeToken') === '1';
  return includeToken || platform === 'mobile' || platform === 'android';
}

