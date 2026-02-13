import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword, generateToken, generateOTP } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { email, password, fullName } = await req.json();

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 });
    }

    // Must be NUST email
    if (!email.endsWith('.edu.pk')) {
      return NextResponse.json({ error: 'Use your official university email' }, { status: 400 });
    }

    // Check existing
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'Account already exists' }, { status: 409 });
    }

    // Hash password & create user
    const passwordHash = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, user_type, status) 
       VALUES ($1, $2, $3, 'STUDENT', 'PENDING_VERIFICATION') 
       RETURNING id, email, full_name`,
      [email, passwordHash, fullName]
    );

    const user = result.rows[0];

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    await query(
      `INSERT INTO otp_tokens (user_id, otp_code, purpose, expires_at) VALUES ($1, $2, 'EMAIL_VERIFICATION', $3)`,
      [user.id, otpCode, expiresAt]
    );

    // In production, send via email. For dev, return in response
    console.log(`OTP for ${email}: ${otpCode}`);

    return NextResponse.json({
      message: 'Account created. Verify your email with the OTP sent.',
      userId: user.id,
      // DEV ONLY - remove in production
      devOtp: process.env.NODE_ENV === 'development' ? otpCode : undefined,
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
