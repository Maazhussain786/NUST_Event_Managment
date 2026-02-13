import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const result = await query(
      `SELECT id, name, abbreviation, campus FROM nust_schools ORDER BY abbreviation ASC`
    );
    return NextResponse.json({ schools: result.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch schools';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
