/**
 * End-to-end tests for the SRS workflows (NFR-08: automated tests).
 *
 * Runs real HTTP requests against a dev server that uses a LOCAL test database,
 * and seeds/inspects that database directly. It refuses to touch anything else.
 *
 *   1. createdb + migrate:   ACTIVE_DB=local LOCAL_DB_NAME=nems_seecs node scripts/migrate.js --create-db
 *   2. start the server:     ACTIVE_DB=local LOCAL_DB_NAME=nems_seecs REDIS_URL= MONGODB_URI= npx next dev -p 4100
 *   3. run:                  TEST_BASE_URL=http://localhost:4100 TEST_DB_NAME=nems_seecs node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:4100';
const DB_NAME = process.env.TEST_DB_NAME;
if (!DB_NAME) throw new Error('Set TEST_DB_NAME to the LOCAL test database name');
if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(new URL(BASE).host)) throw new Error('TEST_BASE_URL must be a local server');

const db = new Client({
  host: process.env.LOCAL_DB_HOST || 'localhost',
  port: Number(process.env.LOCAL_DB_PORT || 5432),
  database: DB_NAME,
  user: process.env.LOCAL_DB_USER || 'postgres',
  password: process.env.LOCAL_DB_PASSWORD,
});

const RUN = crypto.randomBytes(3).toString('hex');
const PASSWORD = 'Passw0rd!x';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const email = (who) => `${who}.${RUN}@seecs.edu.pk`;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function api(token, method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': `10.${RUN.length}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* CSV or empty */ }
  return { status: res.status, json, text, headers: res.headers };
}
const get = (t, u) => api(t, 'GET', u);
const post = (t, u, b) => api(t, 'POST', u, b ?? {});
const patch = (t, u, b) => api(t, 'PATCH', u, b ?? {});
const put = (t, u, b) => api(t, 'PUT', u, b ?? {});
const del = (t, u) => api(t, 'DELETE', u);

function expectStatus(res, status, label) {
  assert.equal(res.status, status, `${label}: expected ${status}, got ${res.status} ${res.text.slice(0, 300)}`);
  return res.json;
}

async function login(who) {
  const res = await post(null, '/api/auth/login?includeToken=1', { email: who.email, password: PASSWORD });
  expectStatus(res, 200, `login ${who.email}`);
  return res.json.token;
}

async function seedUser(key, { userType = 'STUDENT', designation = 'STUDENT', mail } = {}) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const address = mail || email(key);
  const r = await db.query(
    `INSERT INTO users (email, password_hash, full_name, user_type, status, designation, email_verified_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', $5, NOW()) RETURNING id`,
    [address, hash, `Test ${key}`, userType, designation],
  );
  return { id: r.rows[0].id, email: address, name: `Test ${key}` };
}

const U = {};
const T = {};
const S = {};

test('SRS workflows', { timeout: 600_000 }, async (t) => {
  await db.connect();
  t.after(() => db.end());

  for (const key of ['president', 'faculty', 'eventhead', 'financetl', 'logisticstl', 'outreachtl', 'mediatl', 'member', 'candidate', 'outsider']) {
    U[key] = await seedUser(key);
  }
  U.superadmin = await seedUser('superadmin', { userType: 'SUPER_ADMIN', mail: `superadmin.${RUN}@example.com` });
  U.principal = await seedUser('principal', { designation: 'PRINCIPAL' });
  for (const key of Object.keys(U)) T[key] = await login(U[key]);

  // -------------------------------------------------------------------------
  await t.test('auth: SEECS-only sign-up, OTP verification, password reset, session revocation', async () => {
    expectStatus(await post(null, '/api/auth/register', { email: `someone.${RUN}@gmail.com`, password: PASSWORD, fullName: 'X' }), 400, 'non-SEECS email');
    expectStatus(await post(null, '/api/auth/register', { email: email('weakpw'), password: 'short', fullName: 'X' }), 400, 'weak password');

    const reg = expectStatus(await post(null, '/api/auth/register', { email: email('newbie'), password: PASSWORD, fullName: 'New Bie' }), 201, 'register');
    assert.equal(reg.needsVerification, true);
    const blocked = await post(null, '/api/auth/login', { email: email('newbie'), password: PASSWORD });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.json.needsVerification, true);

    // Plant a known code (real codes are only emailed / hashed in the DB).
    await db.query(`UPDATE auth_codes SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [reg.userId]);
    await db.query(
      `INSERT INTO auth_codes (user_id, purpose, code_hash, expires_at) VALUES ($1, 'EMAIL_VERIFICATION', $2, NOW() + INTERVAL '10 minutes')`,
      [reg.userId, sha('123456')],
    );
    expectStatus(await post(null, '/api/auth/verify-otp', { userId: reg.userId, otpCode: '000000' }), 400, 'wrong otp');
    const ok = expectStatus(await post(null, '/api/auth/verify-otp?includeToken=1', { userId: reg.userId, otpCode: '123456' }), 200, 'verify otp');
    assert.ok(ok.token);
    expectStatus(await post(null, '/api/auth/verify-otp', { userId: reg.userId, otpCode: '123456' }), 400, 'otp reuse');

    // Password reset revokes existing sessions.
    const oldToken = ok.token;
    expectStatus(await get(oldToken, '/api/auth/session'), 200, 'session before reset');
    expectStatus(await post(null, '/api/auth/forgot-password', { email: email('newbie') }), 200, 'forgot');
    const resetToken = crypto.randomBytes(16).toString('hex');
    await db.query(`UPDATE auth_codes SET used_at = NOW() WHERE user_id = $1 AND purpose = 'PASSWORD_RESET' AND used_at IS NULL`, [reg.userId]);
    await db.query(
      `INSERT INTO auth_codes (user_id, purpose, code_hash, expires_at) VALUES ($1, 'PASSWORD_RESET', $2, NOW() + INTERVAL '10 minutes')`,
      [reg.userId, sha(resetToken)],
    );
    expectStatus(await post(null, '/api/auth/reset-password', { token: resetToken, password: 'NewPassw0rd' }), 200, 'reset');
    expectStatus(await post(null, '/api/auth/reset-password', { token: resetToken, password: 'NewPassw0rd2' }), 400, 'reset token reuse');
    expectStatus(await get(oldToken, '/api/auth/session'), 401, 'old session after reset');
    expectStatus(await post(null, '/api/auth/login', { email: email('newbie'), password: 'NewPassw0rd' }), 200, 'login with new password');
  });

  // -------------------------------------------------------------------------
  await t.test('society registration + approval seeds SRS roles, portfolios and the Faculty Sponsor', async () => {
    expectStatus(await post(T.president, '/api/societies/register', {
      name: `Test Society ${RUN}`, description: 'Testing', presidentName: U.president.name, email: U.president.email,
    }), 400, 'register without faculty sponsor');
    const reg = await post(T.president, '/api/societies/register', {
      name: `Test Society ${RUN}`, description: 'Testing', presidentName: U.president.name, email: U.president.email,
      facultySponsorEmail: U.faculty.email,
    });
    assert.ok([200, 201].includes(reg.status), reg.text);
    S.id = reg.json.societyId || reg.json.id || reg.json.society?.id;
    assert.ok(S.id, `society id in ${reg.text}`);

    expectStatus(await patch(T.superadmin, `/api/admin/societies/${S.id}`, { action: 'APPROVED' }), 200, 'approve');

    const pres = expectStatus(await get(T.president, `/api/societies/${S.id}/governance/my-permissions`), 200, 'president perms');
    assert.equal(pres.tier, 'ADMIN');
    assert.ok(pres.privileges.includes('CREATE_EVENT'));
    assert.ok(!pres.privileges.includes('APPROVE_MINUTES'), 'Admins must not approve minutes');
    const fs = expectStatus(await get(T.faculty, `/api/societies/${S.id}/governance/my-permissions`), 200, 'faculty perms');
    assert.equal(fs.tier, 'FACULTY_SPONSOR');
    assert.ok(fs.privileges.includes('APPROVE_MINUTES'));
    expectStatus(await get(T.outsider, `/api/societies/${S.id}/governance/my-permissions`), 403, 'outsider perms');

    const portfolios = expectStatus(await get(T.member, `/api/societies/${S.id}/portfolios`), 200, 'portfolio catalog');
    assert.equal(portfolios.portfolios.length, 15);
    S.portfolio = Object.fromEntries(portfolios.portfolios.map((p) => [p.function_key, p.id]));
  });

  // -------------------------------------------------------------------------
  await t.test('account request: member asks to join, Admin requests info, then approves', async () => {
    expectStatus(await post(T.member, `/api/societies/${S.id}/join-requests`, {
      phone: '03001234567', department: 'CS', year_of_study: '2', motivation: 'I want to help',
      requested_role: 'EXECUTIVE', preferred_portfolio_id: S.portfolio.MEDIA,
    }), 201, 'join request');
    const list = expectStatus(await get(T.president, `/api/societies/${S.id}/join-requests`), 200, 'list requests');
    const reqId = list.requests[0].id;
    expectStatus(await get(T.member, `/api/societies/${S.id}/join-requests`), 403, 'member cannot review');
    expectStatus(await patch(T.president, `/api/societies/${S.id}/join-requests/${reqId}`, { action: 'REQUEST_INFO', info_request_message: 'Share your portfolio link' }), 200, 'request info');
    expectStatus(await put(T.member, `/api/societies/${S.id}/join-requests/me`, { response: 'https://example.com/me' }), 200, 'answer info');
    expectStatus(await patch(T.president, `/api/societies/${S.id}/join-requests/${reqId}`, { action: 'APPROVE' }), 200, 'approve request');
    const me = expectStatus(await get(T.member, `/api/societies/${S.id}/join-requests/me`), 200, 'me');
    assert.equal(me.is_member, true);
    assert.equal(me.tier, 'MEMBER');
  });

  // -------------------------------------------------------------------------
  await t.test('events: only Admins create; teams, Team Leads, Executives and Event Head', async () => {
    const start = new Date(Date.now() + 10 * 86400_000);
    const end = new Date(start.getTime() + 2 * 86400_000);
    const body = { title: `DFTW ${RUN}`, description: 'Flagship', location: 'SEECS', event_start: start.toISOString(), event_end: end.toISOString(), thumbnail_url: 'https://example.com/t.png' };
    expectStatus(await post(T.member, `/api/societies/${S.id}/events`, body), 403, 'member creates event');
    const ev = await post(T.president, `/api/societies/${S.id}/events`, body);
    assert.ok([200, 201].includes(ev.status), ev.text);
    S.event = ev.json.event?.id || ev.json.id;
    S.eventStartDay = new Date(start.getTime() + 5 * 3600_000).toISOString().slice(0, 10);

    const fns = ['FINANCE', 'LOGISTICS', 'OUTREACH', 'MEDIA', 'SECURITY'];
    expectStatus(await post(T.member, `/api/events/${S.event}/teams`, { portfolio_ids: [S.portfolio.MEDIA] }), 403, 'member activates team');
    expectStatus(await post(T.president, `/api/events/${S.event}/teams`, { portfolio_ids: fns.map((f) => S.portfolio[f]) }), 201, 'activate teams');
    const ws = expectStatus(await get(T.president, `/api/events/${S.event}/workspace`), 200, 'workspace');
    S.team = Object.fromEntries(ws.teams.map((tm) => [tm.function_key, tm.id]));

    for (const [fn, who] of [['FINANCE', 'financetl'], ['LOGISTICS', 'logisticstl'], ['OUTREACH', 'outreachtl'], ['MEDIA', 'mediatl']]) {
      expectStatus(await post(T.president, `/api/events/${S.event}/teams/${S.team[fn]}/members`, { email: U[who].email, team_role: 'TEAM_LEAD', reason: 'Selected' }), 201, `assign TL ${fn}`);
    }
    T.mediatl = await login(U.mediatl);
    expectStatus(await post(T.mediatl, `/api/events/${S.event}/teams/${S.team.MEDIA}/members`, { email: U.outsider.email, team_role: 'TEAM_LEAD' }), 403, 'TL assigns TL');
    expectStatus(await post(T.mediatl, `/api/events/${S.event}/teams/${S.team.FINANCE}/members`, { email: U.member.email, team_role: 'EXECUTIVE' }), 403, 'TL adds to other team');
    expectStatus(await post(T.mediatl, `/api/events/${S.event}/teams/${S.team.MEDIA}/members`, { email: U.member.email, team_role: 'EXECUTIVE' }), 201, 'TL adds executive');
    expectStatus(await put(T.president, `/api/events/${S.event}/event-head`, { email: U.eventhead.email, reason: 'Experienced' }), 200, 'event head');

    const log = await db.query(`SELECT scope_type, change_type, to_role, reason FROM role_change_log WHERE society_id = $1 ORDER BY created_at`, [S.id]);
    assert.ok(log.rows.some((r) => r.scope_type === 'TEAM' && r.to_role === 'TEAM_LEAD' && r.reason === 'Selected'), 'TL assignment logged with reason');
    assert.ok(log.rows.some((r) => r.scope_type === 'EVENT' && r.to_role === 'EVENT_HEAD' && r.reason === 'Experienced'), 'Event Head logged');
  });

  // -------------------------------------------------------------------------
  await t.test('event plan: Event Head edits, team sees it, every change is logged', async () => {
    expectStatus(await post(T.member, `/api/events/${S.event}/plan`, { day_date: S.eventStartDay, start_time: '10:00', end_time: '11:00', title: 'Opening' }), 403, 'executive edits plan');
    const item = expectStatus(await post(T.eventhead, `/api/events/${S.event}/plan`, { day_date: S.eventStartDay, start_time: '10:00', end_time: '11:00', title: 'Opening', venue: 'Main hall' }), 201, 'add plan item');
    expectStatus(await post(T.eventhead, `/api/events/${S.event}/plan`, { day_date: '2000-01-01', start_time: '10:00', end_time: '11:00', title: 'Bad day' }), 400, 'day outside event');
    expectStatus(await patch(T.eventhead, `/api/events/${S.event}/plan/${item.id}`, { venue: 'Auditorium' }), 200, 'edit plan item');
    const plan = expectStatus(await get(T.member, `/api/events/${S.event}/plan`), 200, 'executive reads plan');
    assert.equal(plan.items[0].venue, 'Auditorium');
    assert.deepEqual(plan.changes.map((c) => c.action).sort(), ['CREATED', 'UPDATED']);
    expectStatus(await get(T.outsider, `/api/events/${S.event}/plan`), 403, 'outsider reads plan');
  });

  // -------------------------------------------------------------------------
  await t.test('recruitment: form -> apply -> shortlist -> interview -> select -> finalize', async () => {
    const form = expectStatus(await post(T.mediatl, `/api/events/${S.event}/recruitment`, {
      target_role: 'EXECUTIVE', team_id: S.team.MEDIA, title: 'Photographers',
      questions: [{ id: 'cam', label: 'Do you own a camera?', type: 'single_choice', required: true, options: ['Yes', 'No'] },
        { id: 'why', label: 'Why?', type: 'long_text', required: true }],
    }), 201, 'create form').form;
    expectStatus(await post(T.financetl, `/api/events/${S.event}/recruitment`, { target_role: 'EXECUTIVE', team_id: S.team.MEDIA, title: 'x', questions: [] }), 403, 'other TL recruits for media');
    expectStatus(await patch(T.mediatl, `/api/recruitment/forms/${form.id}`, { status: 'OPEN' }), 200, 'open form');

    expectStatus(await post(T.candidate, `/api/recruitment/forms/${form.id}/applications`, { answers: { cam: 'Maybe', why: 'x' } }), 400, 'invalid answer');
    const app = expectStatus(await post(T.candidate, `/api/recruitment/forms/${form.id}/applications`, { answers: { cam: 'Yes', why: 'I love photos' } }), 201, 'apply').application;
    expectStatus(await post(T.candidate, `/api/recruitment/forms/${form.id}/applications`, { answers: { cam: 'Yes', why: 'again' } }), 409, 'duplicate application');
    expectStatus(await get(T.candidate, `/api/recruitment/forms/${form.id}/applications`), 403, 'candidate lists applications');

    expectStatus(await patch(T.mediatl, `/api/recruitment/applications/${app.id}`, { action: 'SELECT' }), 409, 'select before shortlist');
    expectStatus(await patch(T.mediatl, `/api/recruitment/applications/${app.id}`, { action: 'SHORTLIST' }), 200, 'shortlist');
    const iv = expectStatus(await post(T.mediatl, `/api/recruitment/applications/${app.id}/interviews`, { scheduled_at: new Date(Date.now() + 86400_000).toISOString(), mode: 'IN_PERSON', location: 'Room 1' }), 201, 'schedule interview');
    expectStatus(await patch(T.mediatl, `/api/recruitment/interviews/${iv.id}`, { status: 'COMPLETED', score: 11 }), 400, 'score out of range');
    expectStatus(await patch(T.mediatl, `/api/recruitment/interviews/${iv.id}`, { status: 'COMPLETED', score: 8.5, notes: 'Good portfolio' }), 200, 'record score');
    expectStatus(await patch(T.mediatl, `/api/recruitment/applications/${app.id}`, { action: 'SELECT' }), 200, 'select');
    expectStatus(await get(T.eventhead, `/api/recruitment/forms/${form.id}/applications`), 200, 'Event Head views recruitment');
    const fin = expectStatus(await post(T.mediatl, `/api/recruitment/forms/${form.id}/finalize`), 200, 'finalize');
    assert.equal(fin.placed, 1);

    const ws = expectStatus(await get(T.candidate, `/api/events/${S.event}/workspace`), 200, 'candidate now in workspace');
    const media = ws.teams.find((tm) => tm.function_key === 'MEDIA');
    assert.ok(media.members.some((m) => m.user_id === U.candidate.id && m.team_role === 'EXECUTIVE'));
    const log = await db.query(`SELECT source FROM role_change_log WHERE user_id = $1 AND scope_type = 'TEAM'`, [U.candidate.id]);
    assert.equal(log.rows[0].source, 'RECRUITMENT');
  });

  // -------------------------------------------------------------------------
  await t.test('duties: Team Lead assigns, Executive updates status, other teams cannot see', async () => {
    const duty = expectStatus(await post(T.mediatl, `/api/events/${S.event}/duties`, { title: 'Cover opening', assignee_id: U.candidate.id, team_id: S.team.MEDIA, location: 'Main hall' }), 201, 'assign duty');
    expectStatus(await post(T.mediatl, `/api/events/${S.event}/duties`, { title: 'x', assignee_id: U.financetl.id, team_id: S.team.MEDIA }), 400, 'assignee not in team');
    expectStatus(await patch(T.candidate, `/api/events/${S.event}/duties/${duty.id}`, { status: 'IN_PROGRESS' }), 200, 'executive updates status');
    expectStatus(await patch(T.candidate, `/api/events/${S.event}/duties/${duty.id}`, { title: 'Hacked' }), 403, 'executive edits duty');
    const fin = expectStatus(await get(T.financetl, `/api/events/${S.event}/duties`), 200, 'finance TL duties');
    assert.ok(!fin.duties.some((d) => d.id === duty.id), 'other team must not see media duty');
    const mine = expectStatus(await get(T.member, `/api/events/${S.event}/duties`), 200, 'teammate duties');
    assert.ok(mine.duties.some((d) => d.id === duty.id), 'teammates see team duties');
    const head = expectStatus(await get(T.eventhead, `/api/events/${S.event}/duties`), 200, 'event head duties');
    assert.ok(head.duties.some((d) => d.id === duty.id));
    const work = expectStatus(await get(T.candidate, '/api/my-work'), 200, 'my work');
    assert.ok(work.duties.some((d) => d.id === duty.id));
  });

  // -------------------------------------------------------------------------
  await t.test('finance: allocate, log expenses, over-budget alert, Finance verifies, records lock, export', async () => {
    expectStatus(await post(T.mediatl, `/api/events/${S.event}/finance/allocations`, { team_id: S.team.MEDIA, amount: 10000 }), 403, 'TL allocates');
    expectStatus(await post(T.president, `/api/events/${S.event}/finance/allocations`, { team_id: S.team.MEDIA, amount: 10000, note: 'Initial' }), 201, 'allocate');
    const exp = { team_id: S.team.MEDIA, category: 'PRINTING', spent_on: new Date().toISOString().slice(0, 10), description: 'Banners' };
    expectStatus(await post(T.financetl, `/api/events/${S.event}/finance/expenses`, { ...exp, amount: 100 }), 403, 'finance TL logs media expense');
    const e1 = expectStatus(await post(T.mediatl, `/api/events/${S.event}/finance/expenses`, { ...exp, amount: 6000 }), 201, 'log expense 1');
    assert.equal(e1.over_budget, false);
    const e2 = expectStatus(await post(T.mediatl, `/api/events/${S.event}/finance/expenses`, { ...exp, amount: 5000, description: 'Standees' }), 201, 'log expense 2');
    assert.equal(e2.over_budget, true, 'second expense crosses the allocation');
    const alert = await db.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND title LIKE 'Over budget%'`, [U.president.id]);
    assert.ok(alert.rows.length > 0, 'Admins get the over-budget alert');

    expectStatus(await patch(T.mediatl, `/api/events/${S.event}/finance/expenses/${e1.id}`, { action: 'VERIFY' }), 403, 'TL verifies own expense');
    expectStatus(await patch(T.financetl, `/api/events/${S.event}/finance/expenses/${e1.id}`, { action: 'VERIFY' }), 200, 'finance verifies');
    expectStatus(await patch(T.financetl, `/api/events/${S.event}/finance/expenses/${e2.id}`, { action: 'REJECT' }), 400, 'reject without reason');
    await assert.rejects(db.query(`UPDATE expenses SET amount = 1 WHERE id = $1`, [e1.id]), /locked/, 'verified expense is locked');
    await assert.rejects(db.query(`DELETE FROM fund_allocations WHERE event_id = $1`, [S.event]), /append-only/, 'allocations are append-only');

    const dash = expectStatus(await get(T.financetl, `/api/events/${S.event}/finance`), 200, 'finance dashboard');
    const media = dash.teams.find((tm) => tm.team_id === S.team.MEDIA);
    assert.equal(media.allocated, 10000);
    assert.equal(media.spent, 11000);
    assert.equal(media.over_budget, true);
    const tlView = expectStatus(await get(T.mediatl, `/api/events/${S.event}/finance`), 200, 'TL finance view');
    assert.equal(tlView.full_view, false);
    assert.ok(tlView.teams.every((tm) => tm.team_id === S.team.MEDIA));
    expectStatus(await get(T.candidate, `/api/events/${S.event}/finance`), 403, 'executive finance');

    const csv = await get(T.financetl, `/api/events/${S.event}/finance/export?type=expenses`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.text, /Banners/);
  });

  // -------------------------------------------------------------------------
  await t.test('sponsors: Outreach manages directory and deals; confirmed money flows to Finance', async () => {
    expectStatus(await post(T.mediatl, `/api/societies/${S.id}/sponsors`, { name: 'Nope' }), 403, 'media TL adds sponsor');
    const sp = expectStatus(await post(T.outreachtl, `/api/societies/${S.id}/sponsors`, { name: `Acme ${RUN}`, contact_email: 'a@acme.com' }), 201, 'add sponsor');
    expectStatus(await post(T.outreachtl, `/api/societies/${S.id}/sponsors/${sp.id}/interactions`, { interaction_type: 'MEETING', summary: 'Pitched gold tier', event_id: S.event }), 201, 'log interaction');
    const deal = expectStatus(await post(T.outreachtl, `/api/events/${S.event}/sponsorships`, { sponsor_id: sp.id, amount: 50000, status: 'CONFIRMED', deliverables: 'Logo on banner' }), 201, 'record deal');
    expectStatus(await patch(T.outreachtl, `/api/events/${S.event}/sponsorships/${deal.id}`, { status: 'RECEIVED' }), 400, 'received without date');
    expectStatus(await patch(T.outreachtl, `/api/events/${S.event}/sponsorships/${deal.id}`, { status: 'RECEIVED', received_on: new Date().toISOString().slice(0, 10) }), 200, 'mark received');
    expectStatus(await patch(T.outreachtl, `/api/events/${S.event}/sponsorships/${deal.id}`, { action: 'VERIFY' }), 403, 'outreach verifies');
    expectStatus(await patch(T.financetl, `/api/events/${S.event}/sponsorships/${deal.id}`, { action: 'VERIFY' }), 200, 'finance verifies');
    expectStatus(await patch(T.outreachtl, `/api/events/${S.event}/sponsorships/${deal.id}`, { amount: 1 }), 409, 'verified deal locked');
    const dash = expectStatus(await get(T.president, `/api/events/${S.event}/finance`), 200, 'finance totals');
    assert.equal(dash.totals.sponsorship_committed, 50000);
    assert.equal(dash.totals.sponsorship_received, 50000);
  });

  // -------------------------------------------------------------------------
  await t.test('inventory: Logistics stocks items, teams request, issue and return with damage/loss', async () => {
    expectStatus(await post(T.mediatl, `/api/societies/${S.id}/inventory`, { name: 'x', quantity: 1 }), 403, 'media TL adds item');
    const item = expectStatus(await post(T.logisticstl, `/api/societies/${S.id}/inventory`, { name: `Walkie-talkie ${RUN}`, quantity: 10, low_stock_threshold: 3, location: 'Store' }), 201, 'add item');
    const req = expectStatus(await post(T.mediatl, `/api/events/${S.event}/inventory-requests`, { team_id: S.team.MEDIA, item_id: item.id, quantity: 8, purpose: 'Crew comms' }), 201, 'request item');
    expectStatus(await patch(T.mediatl, `/api/events/${S.event}/inventory-requests/${req.id}`, { action: 'APPROVE' }), 403, 'TL approves own request');
    expectStatus(await patch(T.logisticstl, `/api/events/${S.event}/inventory-requests/${req.id}`, { action: 'ISSUE' }), 409, 'issue before approve');
    expectStatus(await patch(T.logisticstl, `/api/events/${S.event}/inventory-requests/${req.id}`, { action: 'APPROVE' }), 200, 'approve');
    expectStatus(await patch(T.logisticstl, `/api/events/${S.event}/inventory-requests/${req.id}`, { action: 'ISSUE' }), 200, 'issue');
    let row = await db.query('SELECT quantity_total, quantity_available FROM inventory_items WHERE id = $1', [item.id]);
    assert.deepEqual(row.rows[0], { quantity_total: 10, quantity_available: 2 });
    const low = await db.query(`SELECT 1 FROM notifications WHERE title LIKE 'Low stock%' AND body LIKE $1`, [`%Walkie-talkie ${RUN}%`]);
    assert.ok(low.rows.length > 0, 'low-stock alert sent');
    expectStatus(await patch(T.logisticstl, `/api/events/${S.event}/inventory-requests/${req.id}`, { action: 'RETURN', returned: 6, damaged: 1, lost: 0 }), 400, 'counts must add up');
    expectStatus(await patch(T.logisticstl, `/api/events/${S.event}/inventory-requests/${req.id}`, { action: 'RETURN', returned: 6, damaged: 1, lost: 1, note: 'One dropped, one missing' }), 200, 'return');
    row = await db.query('SELECT quantity_total, quantity_available FROM inventory_items WHERE id = $1', [item.id]);
    assert.deepEqual(row.rows[0], { quantity_total: 8, quantity_available: 8 });
    const txns = await db.query('SELECT txn_type FROM inventory_transactions WHERE item_id = $1 ORDER BY created_at', [item.id]);
    assert.deepEqual(txns.rows.map((r) => r.txn_type), ['ADD', 'ISSUE', 'RETURN', 'DAMAGE', 'LOSS']);
  });

  // -------------------------------------------------------------------------
  await t.test('minutes: Team Lead writes, Faculty Sponsor approves (locks), Admin forwards, Principal decides', async () => {
    const m = expectStatus(await post(T.mediatl, `/api/societies/${S.id}/minutes`, {
      title: 'Media kickoff', meeting_date: new Date().toISOString().slice(0, 10), event_id: S.event, team_id: S.team.MEDIA,
      attendees: ['A', 'B'], agenda: 'Plan coverage', decisions: 'Two photographers', action_items: [{ task: 'Book cameras', owner: 'A' }],
    }), 201, 'create minutes').minutes;
    expectStatus(await post(T.candidate, `/api/societies/${S.id}/minutes`, { title: 'x', meeting_date: '2026-01-01', event_id: S.event, team_id: S.team.MEDIA }), 403, 'executive writes minutes');
    expectStatus(await post(T.mediatl, `/api/societies/${S.id}/minutes/${m.id}/actions`, { action: 'SUBMIT' }), 200, 'submit');
    expectStatus(await post(T.president, `/api/societies/${S.id}/minutes/${m.id}/actions`, { action: 'APPROVE' }), 403, 'Admin approves minutes');
    expectStatus(await post(T.faculty, `/api/societies/${S.id}/minutes/${m.id}/actions`, { action: 'REQUEST_CHANGES', comment: 'Add budget' }), 200, 'request changes');
    expectStatus(await patch(T.mediatl, `/api/societies/${S.id}/minutes/${m.id}`, { title: 'Media kickoff', meeting_date: new Date().toISOString().slice(0, 10), decisions: 'Two photographers, Rs 5000' }), 200, 'edit after changes requested');
    expectStatus(await post(T.mediatl, `/api/societies/${S.id}/minutes/${m.id}/actions`, { action: 'SUBMIT' }), 200, 'resubmit');
    expectStatus(await post(T.faculty, `/api/societies/${S.id}/minutes/${m.id}/actions`, { action: 'APPROVE' }), 200, 'FS approves');
    expectStatus(await patch(T.mediatl, `/api/societies/${S.id}/minutes/${m.id}`, { title: 'Changed', meeting_date: '2026-01-01' }), 409, 'approved minutes locked');
    await assert.rejects(db.query(`UPDATE minutes_sheets SET decisions = 'tampered' WHERE id = $1`, [m.id]), /locked/, 'DB lock');
    expectStatus(await post(T.principal, `/api/societies/${S.id}/minutes/${m.id}/actions`, { action: 'PRINCIPAL_APPROVE' }), 409, 'principal before forward');
    expectStatus(await post(T.president, `/api/societies/${S.id}/minutes/${m.id}/actions`, { action: 'FORWARD' }), 200, 'Admin forwards');
    const inbox = expectStatus(await get(T.principal, '/api/principal/minutes'), 200, 'principal inbox');
    assert.ok(inbox.minutes.some((x) => x.id === m.id));
    expectStatus(await get(T.member, '/api/principal/minutes'), 403, 'non-principal inbox');
    expectStatus(await post(T.principal, `/api/societies/${S.id}/minutes/${m.id}/actions`, { action: 'PRINCIPAL_APPROVE' }), 200, 'principal approves');
    const detail = expectStatus(await get(T.mediatl, `/api/societies/${S.id}/minutes/${m.id}`), 200, 'detail');
    assert.equal(detail.minutes.status, 'PRINCIPAL_APPROVED');
    assert.deepEqual(detail.steps.map((s) => `${s.stage}:${s.action}`), [
      'AUTHOR:SUBMITTED', 'FACULTY_SPONSOR:CHANGES_REQUESTED', 'AUTHOR:RESUBMITTED', 'FACULTY_SPONSOR:APPROVED', 'ADMIN:FORWARDED', 'PRINCIPAL:APPROVED',
    ]);
  });

  // -------------------------------------------------------------------------
  await t.test('officer roles: Faculty Sponsor defines a role and its permissions; changes are logged', async () => {
    const role = expectStatus(await post(T.faculty, `/api/societies/${S.id}/roles`, { name: `Treasurer ${RUN}`, hierarchy_level: 65, privileges: ['VIEW_FINANCE'] }), 201, 'FS creates officer role').role;
    expectStatus(await post(T.president, `/api/societies/${S.id}/roles`, { name: 'Nope', hierarchy_level: 50 }), 403, 'Admin creates role while FS exists');
    const members = expectStatus(await get(T.president, `/api/societies/${S.id}/members`), 200, 'members');
    const list = Array.isArray(members) ? members : members.members;
    const memberRow = list.find((m) => m.user_id === U.member.id);
    expectStatus(await patch(T.president, `/api/societies/${S.id}/members/${memberRow.membership_id || memberRow.id}`, { roleId: role.id }), 400, 'role change without reason');
    expectStatus(await patch(T.president, `/api/societies/${S.id}/members/${memberRow.membership_id || memberRow.id}`, { roleId: role.id, reason: 'Handles accounts' }), 200, 'assign officer role');
    expectStatus(await get(T.member, `/api/societies/${S.id}/governance/finance`), 200, 'treasurer views finance');
    expectStatus(await patch(T.president, `/api/societies/${S.id}/governance/privileges`, { roleId: role.id, privilegeKey: 'VIEW_FINANCE', granted: false }), 403, 'Admin edits officer permissions');
    expectStatus(await patch(T.faculty, `/api/societies/${S.id}/governance/privileges`, { roleId: role.id, privilegeKey: 'APPROVE_MINUTES', granted: true }), 403, 'FS-only privilege cannot be granted');
    expectStatus(await patch(T.faculty, `/api/societies/${S.id}/governance/privileges`, { roleId: role.id, privilegeKey: 'VIEW_FINANCE', granted: false }), 200, 'FS revokes');
    expectStatus(await get(T.member, `/api/societies/${S.id}/governance/finance`), 403, 'treasurer loses finance');
    const log = await db.query(`SELECT change_type, from_role, to_role, reason FROM role_change_log WHERE user_id = $1 AND scope_type = 'SOCIETY' ORDER BY created_at DESC LIMIT 1`, [U.member.id]);
    assert.deepEqual(log.rows[0], { change_type: 'CHANGED', from_role: 'Member', to_role: `Treasurer ${RUN}`, reason: 'Handles accounts' });
    await assert.rejects(db.query(`DELETE FROM role_change_log WHERE user_id = $1`, [U.member.id]), /append-only/);
    await assert.rejects(db.query(`UPDATE audit_logs SET action = 'x' WHERE society_id = $1`, [S.id]), /append-only/);
  });

  // -------------------------------------------------------------------------
  await t.test('chat: announcement-only channels accept posts from managers only', async () => {
    const ch = expectStatus(await post(T.president, `/api/societies/${S.id}/chat`, { name: 'Announcements', mode: 'ANNOUNCEMENT_ONLY' }), 201, 'create channel').channel;
    expectStatus(await post(T.candidate, `/api/societies/${S.id}/chat`, { name: 'x' }), 403, 'member creates channel');
    expectStatus(await post(T.candidate, `/api/societies/${S.id}/chat/${ch.id}/messages`, { content: 'hi' }), 403, 'member posts announcement');
    expectStatus(await post(T.president, `/api/societies/${S.id}/chat/${ch.id}/messages`, { content: 'Welcome!' }), 201, 'admin posts');
    const msgs = expectStatus(await get(T.candidate, `/api/societies/${S.id}/chat/${ch.id}/messages`), 200, 'member reads');
    assert.equal(msgs.canSend, false);
  });

  // -------------------------------------------------------------------------
  await t.test('suspension takes effect immediately (society and platform level)', async () => {
    expectStatus(await post(T.president, `/api/societies/${S.id}/members/suspend`, { targetUserId: U.candidate.id, reason: 'Testing suspension' }), 200, 'suspend member');
    expectStatus(await get(T.candidate, `/api/events/${S.event}/workspace`), 403, 'suspended member loses workspace');
    expectStatus(await get(T.candidate, `/api/events/${S.event}/duties`), 403, 'suspended member loses duties');

    expectStatus(await post(T.superadmin, `/api/admin/users/${U.outsider.id}/suspend`, { reason: 'Testing' }), 200, 'platform suspend');
    expectStatus(await get(T.outsider, '/api/auth/session'), 401, 'suspended user session rejected at once');
  });
});
