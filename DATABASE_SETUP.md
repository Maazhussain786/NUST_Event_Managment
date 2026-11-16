# Database setup

The schema is managed by ordered SQL migrations in `db/migrations/`, applied with
`scripts/migrate.js`. See the **Database migrations** section of the [README](README.md).

## New local database

```bash
# .env.local: ACTIVE_DB=local and LOCAL_DB_* settings
node scripts/migrate.js --create-db
node scripts/seed.js          # optional demo data (local only)
```

## Existing Azure database

1. Take a backup (Azure Portal → the server → Backup and restore, or `pg_dump -Fc`).
2. Record that the baseline is already in place, then apply the rest:

   ```bash
   ACTIVE_DB=azure node scripts/migrate.js --mark-baseline --allow-remote
   ACTIVE_DB=azure node scripts/migrate.js --status
   ```

All migrations were run against a full copy of the live data before release.

## Useful checks

```bash
npm run db:migrate:status
npm run db:test               # connection test
```

## Notes

- `000_baseline.sql` is a `pg_dump --schema-only` of the live database (November 2026).
  The older `schema*.sql` files and the `migrations/` folder are historical and are no
  longer applied.
- Logs that must stay tamper-evident are append-only at the database level:
  `audit_logs`, `role_change_log`, `fund_allocations`, `inventory_transactions`,
  `sponsor_interactions`, `minutes_approval_steps`. Verified expenses, verified
  sponsorship money and approved minutes are locked against edits.
- Never put real passwords in this repository. Super admins are managed with
  `scripts/sync-super-admins.js`, which never sets or resets a password.
