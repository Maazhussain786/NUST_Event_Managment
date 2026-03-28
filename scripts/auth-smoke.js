/*
  Basic auth smoke test.
  Usage:
    SMOKE_EMAIL=user@seecs.edu.pk SMOKE_PASSWORD=secret node scripts/auth-smoke.js
*/

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:4000';
const email = process.env.SMOKE_EMAIL || '';
const password = process.env.SMOKE_PASSWORD || '';

if (!email || !password) {
  console.error('Set SMOKE_EMAIL and SMOKE_PASSWORD before running this script.');
  process.exit(1);
}

function extractAuthCookie(setCookieHeader) {
  if (!setCookieHeader) return '';
  const parts = setCookieHeader.split(',');
  for (const chunk of parts) {
    const match = chunk.match(/auth_token=([^;]+)/i);
    if (match?.[1]) return `auth_token=${match[1]}`;
  }
  return '';
}

async function run() {
  console.log(`Auth smoke test against ${baseUrl}`);

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const loginBody = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok) {
    throw new Error(`Login failed (${loginRes.status}): ${loginBody.error || 'unknown error'}`);
  }

  const authCookie = extractAuthCookie(loginRes.headers.get('set-cookie') || '');
  if (!authCookie) {
    throw new Error('Login succeeded but auth cookie was not set.');
  }

  const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: authCookie },
  });
  const sessionBody = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok || !sessionBody?.authenticated) {
    throw new Error('Session validation failed after login.');
  }

  const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: authCookie },
  });
  if (!logoutRes.ok) {
    throw new Error(`Logout failed (${logoutRes.status}).`);
  }

  const postLogoutSessionRes = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: authCookie },
  });

  if (postLogoutSessionRes.status !== 401) {
    throw new Error(
      `Expected session to be invalid after logout, got ${postLogoutSessionRes.status}.`,
    );
  }

  console.log('Auth smoke test passed.');
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
