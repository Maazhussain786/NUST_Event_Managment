export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * GET /.well-known/assetlinks.json
 *
 * Serves the Digital Asset Links file for TWA verification.
 * Must return JSON with no redirects.
 */
export async function GET() {
  try {
    const filePath = join(process.cwd(), 'public', '.well-known', 'assetlinks.json');
    const content = readFileSync(filePath, 'utf-8');

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
