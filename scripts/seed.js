#!/usr/bin/env node
/**
 * SEECS demo data for a LOCAL database (refuses to run against anything else).
 *
 *   ACTIVE_DB=local LOCAL_DB_NAME=nems_seecs node scripts/migrate.js --create-db
 *   ACTIVE_DB=local LOCAL_DB_NAME=nems_seecs node scripts/seed.js
 *
 * Creates one approved society with the full SRS structure (Faculty Sponsor, Admins,
 * Officers, an event with teams, Team Leads, Executives, Event Head) and sample
 * plan, duties, recruitment, finance, sponsors, inventory and minutes.
 * Every demo account uses the password in SEED_PASSWORD (default printed at the end).
 * Running it twice is safe: existing demo rows are left alone.
 */
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

if (process.env.ACTIVE_DB !== 'local') {
  console.error('seed.js only runs against the local database. Set ACTIVE_DB=local.');
  process.exit(1);
}

const PASSWORD = process.env.SEED_PASSWORD || 'SeecsDemo2026';
const SOCIETY_NAME = 'SEECS Events Society (Demo)';
const PEOPLE = {
  admin: { name: 'Platform Admin', email: 'admin@seecs-demo.local', userType: 'SUPER_ADMIN' },
  principal: { name: 'Principal SEECS', email: 'principal.demo@seecs.edu.pk', designation: 'PRINCIPAL' },
  sponsor: { name: 'Dr. Faculty Sponsor', email: 'sponsor.demo@seecs.edu.pk', designation: 'FACULTY' },
  president: { name: 'Ayesha President', email: 'president.demo@seecs.edu.pk' },
  gensec: { name: 'Bilal General Secretary', email: 'gensec.demo@seecs.edu.pk' },
  finsec: { name: 'Sara Finance Secretary', email: 'finsec.demo@seecs.edu.pk' },
  head: { name: 'Hamza Event Head', email: 'eventhead.demo@seecs.edu.pk' },
  financeTl: { name: 'Zainab Finance TL', email: 'finance.tl.demo@seecs.edu.pk' },
  logisticsTl: { name: 'Usman Logistics TL', email: 'logistics.tl.demo@seecs.edu.pk' },
  outreachTl: { name: 'Hira Outreach TL', email: 'outreach.tl.demo@seecs.edu.pk' },
  mediaTl: { name: 'Ali Media TL', email: 'media.tl.demo@seecs.edu.pk' },
  securityTl: { name: 'Omar Security TL', email: 'security.tl.demo@seecs.edu.pk' },
  exec1: { name: 'Fatima Executive', email: 'exec1.demo@seecs.edu.pk' },
  exec2: { name: 'Ahmed Executive', email: 'exec2.demo@seecs.edu.pk' },
  student: { name: 'Student Applicant', email: 'student.demo@seecs.edu.pk' },
};

async function main() {
  const client = new Client({
    host: process.env.LOCAL_DB_HOST || 'localhost',
    port: parseInt(process.env.LOCAL_DB_PORT || '5432', 10),
    database: process.env.LOCAL_DB_NAME || 'event_management',
    user: process.env.LOCAL_DB_USER || 'postgres',
    password: process.env.LOCAL_DB_PASSWORD,
  });
  await client.connect();
  const q = (text, params) => client.query(text, params);

  try {
    const existing = await q('SELECT id FROM societies WHERE name = $1', [SOCIETY_NAME]);
    if (existing.rows.length > 0) {
      console.log(`"${SOCIETY_NAME}" already exists — nothing to do.`);
      return;
    }
    await q('BEGIN');

    // ── People ─────────────────────────────────────────────────────────────
    const hash = await bcrypt.hash(PASSWORD, 12);
    const id = {};
    for (const [key, p] of Object.entries(PEOPLE)) {
      const r = await q(
        `INSERT INTO users (email, password_hash, full_name, user_type, status, designation, email_verified_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', $5, NOW())
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING id`,
        [p.email, hash, p.name, p.userType || 'STUDENT', p.designation || 'STUDENT'],
      );
      id[key] = r.rows[0].id;
    }
    await q(`SELECT set_config('app.actor_id', $1, true), set_config('app.change_reason', 'Demo seed', true), set_config('app.change_source', 'SYSTEM', true)`, [id.admin]);

    // ── Society with SRS roles and portfolio catalog ───────────────────────
    const society = (await q(
      `INSERT INTO societies (name, description, status, created_by, approved_by, approved_at, is_nust_wide, school_id,
                              president_name, contact_email, faculty_advisor_name, faculty_sponsor_email, category)
       VALUES ($1, 'Organising committee for SEECS flagship events (demo data).', 'APPROVED', $2, $3, NOW(), FALSE,
               (SELECT id FROM nust_schools WHERE abbreviation = 'SEECS'), $4, $5, $6, $7, 'Technology')
       RETURNING id`,
      [SOCIETY_NAME, id.president, id.admin, PEOPLE.president.name, PEOPLE.president.email, PEOPLE.sponsor.name, PEOPLE.sponsor.email],
    )).rows[0].id;
    await q('SELECT fn_seed_society_roles($1)', [society]);
    await q('SELECT fn_seed_society_portfolios($1, $2)', [society, id.president]);
    await q('INSERT INTO society_settings (society_id) VALUES ($1) ON CONFLICT DO NOTHING', [society]);

    const role = async (name) => (await q('SELECT id FROM roles WHERE society_id = $1 AND name = $2', [society, name])).rows[0].id;
    const member = (userKey, roleName) =>
      role(roleName).then((roleId) => q(
        `INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by) VALUES ($1, $2, $3, TRUE, $4)`,
        [id[userKey], society, roleId, id.admin],
      ));
    await member('sponsor', 'Faculty Sponsor');
    await member('president', 'President');
    await member('gensec', 'General Secretary');
    await member('finsec', 'Finance Secretary');
    for (const k of ['head', 'financeTl', 'logisticsTl', 'outreachTl', 'mediaTl', 'securityTl', 'exec1', 'exec2']) await member(k, 'Member');

    // ── Event workspace: DFTW ──────────────────────────────────────────────
    const start = new Date(Date.now() + 21 * 86400_000);
    start.setUTCHours(4, 0, 0, 0); // 09:00 PKT
    const end = new Date(start.getTime() + 2 * 86400_000 + 9 * 3600_000);
    const event = (await q(
      `INSERT INTO events (society_id, title, description, location, event_start, event_end, registration_end,
                           max_participants, created_by, thumbnail_url, event_head_id, budget_total, registration_link)
       VALUES ($1, 'DFTW 2026', 'Developers Festival & Tech Week — flagship SEECS event (demo).', 'SEECS Main Hall',
               $2, $3, $4, 500, $5, 'https://images.unsplash.com/photo-1540575467063-178a50c2df87', $6, 400000,
               'evt-demo-dftw-2026')
       RETURNING id`,
      [society, start.toISOString(), end.toISOString(), new Date(start.getTime() - 86400_000).toISOString(), id.president, id.head],
    )).rows[0].id;

    const portfolio = async (fn) => (await q('SELECT id FROM portfolios WHERE society_id = $1 AND function_key = $2', [society, fn])).rows[0].id;
    const team = {};
    for (const fn of ['FINANCE', 'LOGISTICS', 'OUTREACH', 'MEDIA', 'SECURITY', 'EVENT_MANAGEMENT']) {
      team[fn] = (await q(
        `INSERT INTO event_teams (society_id, event_id, portfolio_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
        [society, event, await portfolio(fn), id.president],
      )).rows[0].id;
    }
    const place = (fn, userKey, teamRole) => q(
      `INSERT INTO event_team_members (team_id, event_id, society_id, user_id, team_role, assigned_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [team[fn], event, society, id[userKey], teamRole, id.president],
    );
    await place('FINANCE', 'financeTl', 'TEAM_LEAD');
    await place('LOGISTICS', 'logisticsTl', 'TEAM_LEAD');
    await place('OUTREACH', 'outreachTl', 'TEAM_LEAD');
    await place('MEDIA', 'mediaTl', 'TEAM_LEAD');
    await place('SECURITY', 'securityTl', 'TEAM_LEAD');
    await place('MEDIA', 'exec1', 'EXECUTIVE');
    await place('SECURITY', 'exec2', 'EXECUTIVE');

    // ── Plan, duties ───────────────────────────────────────────────────────
    const day1 = new Date(start.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
    for (const [s, e, title, venue, fn] of [
      ['09:00', '10:00', 'Opening ceremony', 'Main Hall', 'EVENT_MANAGEMENT'],
      ['10:30', '13:00', 'Hackathon kickoff', 'Lab 1-4', 'EVENT_MANAGEMENT'],
      ['14:00', '16:00', 'Industry panel', 'Auditorium', 'OUTREACH'],
    ]) {
      await q(
        `INSERT INTO event_plan_items (event_id, society_id, day_date, start_time, end_time, title, venue, team_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [event, society, day1, s, e, title, venue, team[fn], id.head],
      );
    }
    await q(
      `INSERT INTO duties (society_id, event_id, team_id, title, location, starts_at, assignee_id, assigned_by)
       VALUES ($1, $2, $3, 'Photograph the opening ceremony', 'Main Hall', $4, $5, $6),
              ($1, $2, $7, 'Gate check-in, shift 1', 'Main gate', $4, $8, $9)`,
      [society, event, team.MEDIA, start.toISOString(), id.exec1, id.mediaTl, team.SECURITY, id.exec2, id.securityTl],
    );

    // ── Recruitment (open), finance, sponsors, inventory, minutes ─────────
    await q(
      `INSERT INTO recruitment_forms (society_id, event_id, team_id, target_role, title, description, questions, status, created_by)
       VALUES ($1, $2, $3, 'EXECUTIVE', 'Media team — photographers & designers', 'Help us cover DFTW 2026.',
               $4::jsonb, 'OPEN', $5)`,
      [society, event, team.MEDIA, JSON.stringify([
        { id: 'skill', label: 'What do you do best?', type: 'single_choice', required: true, options: ['Photography', 'Video', 'Design'] },
        { id: 'portfolio', label: 'Link to your work', type: 'url', required: false },
        { id: 'why', label: 'Why do you want to join?', type: 'long_text', required: true },
      ]), id.mediaTl],
    );
    await q(
      `INSERT INTO fund_allocations (society_id, event_id, team_id, amount, note, allocated_by)
       VALUES ($1, $2, NULL, 400000, 'Event budget', $3), ($1, $2, $4, 60000, 'Media budget', $3), ($1, $2, $5, 80000, 'Logistics budget', $3)`,
      [society, event, id.president, team.MEDIA, team.LOGISTICS],
    );
    await q(
      `INSERT INTO expenses (society_id, event_id, team_id, amount, category, spent_on, description, submitted_by)
       VALUES ($1, $2, $3, 18500, 'PRINTING', CURRENT_DATE, 'Standees and banners', $4)`,
      [society, event, team.MEDIA, id.mediaTl],
    );
    const sponsor = (await q(
      `INSERT INTO sponsors (society_id, name, industry, contact_name, contact_email, created_by)
       VALUES ($1, 'Acme Tech (demo)', 'Software', 'Partnerships Team', 'partners@acme.example', $2) RETURNING id`,
      [society, id.outreachTl],
    )).rows[0].id;
    await q(
      `INSERT INTO sponsor_interactions (society_id, sponsor_id, event_id, interaction_type, summary, logged_by)
       VALUES ($1, $2, $3, 'MEETING', 'Pitched the gold tier; they want logo on banners and a booth.', $4)`,
      [society, sponsor, event, id.outreachTl],
    );
    await q(
      `INSERT INTO sponsorships (society_id, sponsor_id, event_id, amount, status, deliverables, logged_by)
       VALUES ($1, $2, $3, 150000, 'CONFIRMED', 'Logo on banners, booth space', $4)`,
      [society, sponsor, event, id.outreachTl],
    );
    for (const [name, qty, cat] of [['Walkie-talkie', 20, 'Communication'], ['Folding table', 40, 'Furniture'], ['Extension cord', 25, 'Electrical']]) {
      const item = (await q(
        `INSERT INTO inventory_items (society_id, name, category, quantity_total, quantity_available, low_stock_threshold, location, created_by)
         VALUES ($1, $2, $3, $4, $4, 3, 'SEECS store room', $5) RETURNING id`,
        [society, name, cat, qty, id.logisticsTl],
      )).rows[0].id;
      await q(
        `INSERT INTO inventory_transactions (society_id, item_id, txn_type, quantity, note, performed_by) VALUES ($1, $2, 'ADD', $3, 'Initial stock', $4)`,
        [society, item, qty, id.logisticsTl],
      );
    }
    await q(
      `INSERT INTO inventory_requests (society_id, event_id, team_id, item_id, quantity, purpose, requested_by)
       SELECT $1, $2, $3, id, 6, 'Security team radios', $4 FROM inventory_items WHERE society_id = $1 AND name = 'Walkie-talkie'`,
      [society, event, team.SECURITY, id.securityTl],
    );
    const minutes = (await q(
      `INSERT INTO minutes_sheets (society_id, event_id, team_id, title, meeting_date, venue, attendees, agenda, decisions, action_items, status, created_by, submitted_at)
       VALUES ($1, $2, $3, 'Media team kickoff', CURRENT_DATE, 'Room 101', '["Ali", "Fatima"]'::jsonb,
               'Coverage plan for DFTW', 'Two photographers per day; reels posted nightly',
               '[{"task":"Book cameras","owner":"Ali","due":null}]'::jsonb, 'SUBMITTED', $4, NOW())
       RETURNING id`,
      [society, event, team.MEDIA, id.mediaTl],
    )).rows[0].id;
    await q(`INSERT INTO minutes_approval_steps (minutes_id, stage, action, actor_id) VALUES ($1, 'AUTHOR', 'SUBMITTED', $2)`, [minutes, id.mediaTl]);

    await q('COMMIT');
    console.log(`Seeded "${SOCIETY_NAME}" with event DFTW 2026.\n`);
    console.log(`Every demo account's password: ${PASSWORD}\n`);
    for (const [key, p] of Object.entries(PEOPLE)) console.log(`  ${key.padEnd(12)} ${p.email}`);
  } catch (error) {
    await q('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
