# SEECS Events Management System (NEMS)

A web app / PWA for running events at SEECS (School of Electrical Engineering & Computer
Science, NUST). Each SEECS society works as an organising body under a Faculty Sponsor;
each event (DFTW, AICON, Convocation, Welcome, …) is its own workspace with teams,
a plan, duties, recruitment, finance, sponsors, inventory and minutes.

It implements the **NEMS Software Requirements Specification v1.0** — see
[docs/SRS_TRACEABILITY.md](docs/SRS_TRACEABILITY.md) for where each requirement lives.

## Roles

| Level | Role | What they do |
|---|---|---|
| Platform | **Super Admin** | Approves societies, assigns each society's Faculty Sponsor, platform settings |
| Platform | **Principal** | Final approval of minutes forwarded by a society Admin |
| Society | **Faculty Sponsor** | Highest authority; approves minutes; defines Officer roles and their permissions |
| Society | **Admin** (President, designated Admins) | Full access: accounts, events, roles, every module |
| Society | **Officer** (Vice President, General Secretary, Finance Secretary, or any role the Faculty Sponsor creates) | Exactly the permissions the Faculty Sponsor grants |
| Society | **Member** | Basic access; joins event teams |
| Event | **Event Head** (optional) | Leads one event: edits the plan, assigns duties, writes minutes |
| Team | **Team Lead** | Runs a portfolio team for an event: recruitment, duties, expenses, item requests, minutes |
| Team | **Executive** | Team member: sees team duties and schedule, updates own duty status |
| — | **Audience** | Registers for events and gets QR tickets |

Portfolio teams carry module powers inside their event: **Finance** verifies expenses
and sponsorship money, **Logistics** approves and issues items, **Outreach/Sponsors**
manages sponsors, **Security / Ushers / Crowd Control** check people in.

All permission checks go through `src/lib/rbac.ts`, which asks the database function
`fn_has_privilege()` — the same rules apply in SQL and in the API.
Every role change is written to an append-only `role_change_log` with who, when and why.

## Tech stack

- Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- PostgreSQL (Azure in production, local for development) — source of truth
- Azure Blob Storage (media, receipts), optional Redis cache and MongoDB read model
- JWT in an httpOnly cookie, bcrypt passwords, email OTP verification
- Email over SMTP (nodemailer)

## Getting started (local)

Requirements: Node.js 18+, PostgreSQL 14+.

```bash
npm install
```

Create `.env.local` (never commit it):

```env
# Database — local development
ACTIVE_DB=local
LOCAL_DB_HOST=localhost
LOCAL_DB_PORT=5432
LOCAL_DB_NAME=nems_seecs
LOCAL_DB_USER=postgres
LOCAL_DB_PASSWORD=...

# Auth — use a long random value (e.g. `openssl rand -base64 48`)
JWT_SECRET=...
APP_BASE_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:4000

# Who may sign up (comma-separated domains). Default: seecs.edu.pk
ALLOWED_EMAIL_DOMAINS=seecs.edu.pk

# Email (verification codes, password reset, notifications).
# Without SMTP, development prints emails to the server console instead.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM="SEECS Events <events@seecs.edu.pk>"

# Media storage
AZURE_BLOB_CONNECTION_STRING=...
```

Create the database, apply every migration, and load demo data:

```bash
node scripts/migrate.js --create-db    # creates nems_seecs and applies db/migrations/*
node scripts/seed.js                   # demo society, event DFTW 2026, all roles
npm run dev                            # http://localhost:4000
```

The seed prints the demo accounts (one shared demo password, local only).

## Database migrations

`db/migrations/` is the only place the schema changes:

| File | What it does |
|---|---|
| `000_baseline.sql` | Exact schema of the live database (Nov 2026) |
| `001` | SEECS scope, OTP/reset codes, session revocation, immutable audit log |
| `002` | SRS role tiers, privilege catalog, role templates, `fn_has_privilege`, role history |
| `003` | Portfolio catalog, event teams, Event Head, event plan + change history |
| `004`–`008` | Recruitment, duties, finance & sponsors, inventory, minutes |
| `009` | Officer templates seeded once; chats without wings |
| `010` | Society registration columns (fixes registration, broken since April 2026) |

```bash
npm run db:migrate:status          # what has run
npm run db:migrate                 # apply pending (local DB only)
```

`migrate.js` refuses to touch a non-local database unless you pass `--allow-remote`.
For the existing Azure database, record the baseline once, then migrate:

```bash
ACTIVE_DB=azure node scripts/migrate.js --mark-baseline --allow-remote
```

**Back up the Azure database before migrating it.** The migrations were tested on a full
copy of the live data. The old `schema*.sql` files and `migrations/` folder are kept
only for reference.

## Tests

End-to-end tests drive the real API against a local test database (sign-up/OTP/reset,
society approval, account requests, teams, plan, recruitment, duties, finance,
sponsors, inventory, minutes, officer permissions, chat modes, suspension):

```bash
# terminal 1 — server against the local DB
npm run dev   # with ACTIVE_DB=local in .env.local; use -p 4100 or set TEST_BASE_URL
# terminal 2
TEST_BASE_URL=http://localhost:4000 TEST_DB_NAME=nems_seecs npm run test:e2e
```

Also: `npm run typecheck`, `npm run lint`, `npm run build`.

## Super admins

```bash
SUPER_ADMINS="Name <email>, Name <email>" node scripts/sync-super-admins.js
```

Promotes existing accounts and creates missing ones with a random password (set your
own with **Forgot password**). It never resets an existing password.

## Project structure

```
src/
  app/
    (auth)/            sign in, sign up, OTP, forgot/reset password
    (main)/            student app: events, tickets, societies, my-work, recruitment, principal
    society/[id]/      society management: members, roles, events + event workspace,
                       minutes, inventory, sponsors, finance, chat, settings
    platform/          super admin console
    api/               REST API
  lib/
    rbac.ts            all permission rules (society, event, team)
    auth.ts            sessions, OTP / reset codes
    email.ts notify.ts email + in-app + push notifications
db/migrations/         schema history (run with scripts/migrate.js)
tests/                 end-to-end tests
scripts/               migrate, seed, super admin sync, maintenance
```

## Team

Maaz Hussain · Muhammad Abdul Daym · Muhammad Bilal Atif — SEECS, NUST
